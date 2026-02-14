using System.Text;
using TestEngine.Models.Dsl;

namespace TestEngine.Services;

internal class ProducerDslToCSharpCompiler
{
    private readonly List<DslDiagnostic> _diagnostics = [];

    public ProducerDslCompileResult Compile(DslProducerDefinition definition)
    {
        ValidateDsl(definition);

        var sb = new StringBuilder();
        sb.AppendLine("namespace SharedTest;");
        sb.AppendLine();
        sb.AppendLine("public partial class DataProducer");
        sb.AppendLine("{");

        for (var i = 0; i < definition.Drafts.Count; i++)
        {
            if (i > 0)
                sb.AppendLine();

            EmitDraftMethod(sb, definition.Drafts[i], definition);
        }

        sb.AppendLine("}");

        return new ProducerDslCompileResult
        {
            CSharpCode = sb.ToString(),
            Diagnostics = _diagnostics
        };
    }

    private void EmitDraftMethod(StringBuilder sb, DslDraftDefinition draft, DslProducerDefinition definition)
    {
        var entity = draft.Entity.LogicalName;
        var paramName = DeriveParamName(entity);
        var accessMod = draft.AccessModifier;

        // Method signature
        sb.AppendLine($"    {accessMod} Draft<{entity}> {draft.Id}({entity}? {paramName} = null)");
        sb.AppendLine("    {");

        // Null-coalescing instantiation
        sb.AppendLine($"        {paramName} ??= new {entity}();");

        if (draft.Rules.Count > 0)
            sb.AppendLine();

        // EnsureValue calls
        foreach (var rule in draft.Rules)
        {
            EmitRule(sb, rule, paramName, draft, definition);
        }

        sb.AppendLine();

        // Return statement
        sb.AppendLine($"        return new Draft<{entity}>(this, {paramName});");
        sb.AppendLine("    }");
    }

    private void EmitRule(StringBuilder sb, DslDraftRule rule, string paramName,
        DslDraftDefinition draft, DslProducerDefinition definition)
    {
        var valueCode = CompileValue(rule.Value, draft, definition);
        if (valueCode == null)
            return;

        switch (rule.Value)
        {
            case DslDraftReferenceValue:
                // Reference uses lambda overload
                sb.AppendLine($"        {paramName}.EnsureValue(");
                sb.AppendLine($"            a => a.{rule.Attribute},");
                sb.AppendLine($"            {valueCode});");
                break;
            default:
                sb.AppendLine($"        {paramName}.EnsureValue(a => a.{rule.Attribute}, {valueCode});");
                break;
        }
    }

    private string? CompileValue(DslDraftValue value, DslDraftDefinition draft, DslProducerDefinition definition)
    {
        switch (value)
        {
            case DslDraftConstantValue constant:
                return CompileConstant(constant);

            case DslDraftEnumValue enumVal:
                return $"{enumVal.EnumType}.{enumVal.Value}";

            case DslDraftReferenceValue reference:
                return CompileReference(reference, draft, definition);

            default:
                _diagnostics.Add(new DslDiagnostic
                {
                    Code = ProducerDslDiagnosticCodes.UnsupportedValueKind,
                    Message = $"Unknown value kind '{value.Kind}' in draft '{draft.Id}'.",
                    Location = new DslDiagnosticLocation { Section = "rules" }
                });
                return null;
        }
    }

    private static string CompileConstant(DslDraftConstantValue constant)
    {
        return constant.ValueType switch
        {
            "string" => $"\"{EscapeString(constant.Value?.ToString() ?? "")}\"",
            "number" => FormatNumber(constant.Value),
            "boolean" => constant.Value is true or "true" or "True" ? "true" : "false",
            _ => $"\"{EscapeString(constant.Value?.ToString() ?? "")}\""
        };
    }

    private string CompileReference(DslDraftReferenceValue reference, DslDraftDefinition draft, DslProducerDefinition definition)
    {
        // Validate that referenced draft exists
        if (!reference.Self && !definition.Drafts.Any(d => d.Id == reference.Draft))
        {
            _diagnostics.Add(new DslDiagnostic
            {
                Code = ProducerDslDiagnosticCodes.UnresolvedDraftReference,
                Message = $"Draft '{draft.Id}' references unknown draft '{reference.Draft}'.",
                Location = new DslDiagnosticLocation { Section = "rules", Hint = reference.Draft }
            });
        }

        var chain = new StringBuilder();
        chain.Append($"() => {reference.Draft}(null)");

        if (reference.Build)
            chain.Append(".Build()");

        if (!string.IsNullOrEmpty(reference.Transform))
            chain.Append($".{reference.Transform}()");

        return chain.ToString();
    }

    private void ValidateDsl(DslProducerDefinition definition)
    {
        // Check for duplicate draft ids
        var ids = new HashSet<string>();
        foreach (var draft in definition.Drafts)
        {
            if (!ids.Add(draft.Id))
            {
                _diagnostics.Add(new DslDiagnostic
                {
                    Code = ProducerDslDiagnosticCodes.DuplicateDraftId,
                    Message = $"Duplicate draft id '{draft.Id}'."
                });
            }
        }

        // Check self-reference declarations
        foreach (var draft in definition.Drafts)
        {
            foreach (var rule in draft.Rules)
            {
                if (rule.Value is DslDraftReferenceValue refVal)
                {
                    if (refVal.Draft == draft.Id && !refVal.Self)
                    {
                        _diagnostics.Add(new DslDiagnostic
                        {
                            Code = ProducerDslDiagnosticCodes.SelfReferenceMissing,
                            Message = $"Draft '{draft.Id}' references itself but 'self' is not set to true.",
                            Location = new DslDiagnosticLocation { Section = "rules" }
                        });
                    }
                }
            }
        }
    }

    private static string DeriveParamName(string entityName)
    {
        // Use a short conventional name based on the entity
        // e.g., ape_skill -> skill, ape_developer -> developer
        var parts = entityName.Split('_');
        return parts.Length > 1 ? parts[^1] : entityName;
    }

    private static string EscapeString(string value)
    {
        return value
            .Replace("\\", "\\\\")
            .Replace("\"", "\\\"")
            .Replace("\n", "\\n")
            .Replace("\r", "\\r")
            .Replace("\t", "\\t");
    }

    private static string FormatNumber(object value)
    {
        if (value is double d)
        {
            if (d == Math.Truncate(d) && !double.IsInfinity(d))
                return ((long)d).ToString();
            return d.ToString("G");
        }
        return value?.ToString() ?? "0";
    }
}
