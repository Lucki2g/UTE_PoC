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
        var accessMod = draft.AccessModifier;

        // Build alias map from explicit "ref" rules + auto-detect multi-use withDefault refs
        var refAliases = BuildRefAliasMap(draft);

        // Method signature
        sb.AppendLine($"    {accessMod} Draft<{entity}> {draft.Id}()");
        sb.AppendLine("    {");

        // Emit Ref declarations (one per alias)
        foreach (var (draftRef, alias) in refAliases)
        {
            sb.AppendLine($"        var {alias} = Ref({draftRef});");
        }

        // Fluent chain — only With/WithDefault rules; ref rules are declarations already emitted
        var fluentRules = draft.Rules.Where(r => r.Type is "with" or "withDefault").ToList();

        if (refAliases.Count > 0 && fluentRules.Count > 0)
            sb.AppendLine();

        if (fluentRules.Count == 0)
        {
            if (refAliases.Count == 0)
                sb.AppendLine($"        return new Draft<{entity}>(this);");
            else
                sb.AppendLine($"        return new Draft<{entity}>(this);");
        }
        else
        {
            sb.AppendLine($"        return new Draft<{entity}>(this)");

            for (var i = 0; i < fluentRules.Count; i++)
            {
                var isLast = i == fluentRules.Count - 1;
                EmitRuleFluentLine(sb, fluentRules[i], draft, refAliases, isLast);
            }
        }

        sb.AppendLine("    }");
    }

    /// <summary>
    /// Builds the ref alias map from:
    /// 1. Explicit "ref" rules — use the rule's alias if provided, otherwise derive it.
    /// 2. Auto-detected withDefault rules that share the same draft method (multi-use).
    /// Returns: draftMethodName -> variable alias (e.g. "DraftValidB" -> "b").
    /// </summary>
    private static Dictionary<string, string> BuildRefAliasMap(DslDraftDefinition draft)
    {
        var aliases = new Dictionary<string, string>();

        // Explicit ref rules take priority
        foreach (var rule in draft.Rules)
        {
            if (rule.Type == "ref" && !string.IsNullOrEmpty(rule.Draft))
            {
                var alias = !string.IsNullOrEmpty(rule.Alias) ? rule.Alias : DeriveRefAlias(rule.Draft);
                aliases[rule.Draft] = alias;
            }
        }

        // Auto-detect: withDefault rules that reference the same draft more than once
        var refCounts = new Dictionary<string, int>();
        foreach (var rule in draft.Rules)
        {
            if (rule.Type == "withDefault" && rule.Value is DslDraftReferenceValue refVal && !refVal.Self
                && string.IsNullOrEmpty(refVal.RefAlias))
            {
                refCounts[refVal.Draft] = refCounts.GetValueOrDefault(refVal.Draft, 0) + 1;
            }
        }

        foreach (var (draftMethod, count) in refCounts)
        {
            if (count > 1 && !aliases.ContainsKey(draftMethod))
                aliases[draftMethod] = DeriveRefAlias(draftMethod);
        }

        return aliases;
    }

    private static string DeriveRefAlias(string draftMethodName)
    {
        // DraftValidB -> b, DraftValidSkill -> skill, DraftValidRole -> role
        var name = draftMethodName;
        if (name.StartsWith("Draft", StringComparison.Ordinal))
            name = name["Draft".Length..];
        if (name.StartsWith("Valid", StringComparison.Ordinal))
            name = name["Valid".Length..];
        if (name.Length == 0) return "dep";
        return char.ToLowerInvariant(name[0]) + name[1..];
    }

    private void EmitRuleFluentLine(StringBuilder sb, DslDraftRule rule, DslDraftDefinition draft,
        Dictionary<string, string> refAliases, bool isLast)
    {
        var terminator = isLast ? ";" : "";
        var entity = draft.Entity.LogicalName;
        var paramAlias = DeriveParamName(entity);

        switch (rule.Type)
        {
            case "with":
                EmitWithLine(sb, rule, paramAlias, draft, terminator);
                break;

            case "withDefault":
                EmitWithDefaultLine(sb, rule, paramAlias, draft, refAliases, terminator);
                break;

            default:
                _diagnostics.Add(new DslDiagnostic
                {
                    Code = ProducerDslDiagnosticCodes.UnsupportedValueKind,
                    Message = $"Unknown rule type '{rule.Type}' in draft '{draft.Id}', treating as 'with'.",
                    Location = new DslDiagnosticLocation { Section = "rules" }
                });
                EmitWithLine(sb, rule, paramAlias, draft, terminator);
                break;
        }
    }

    private void EmitWithLine(StringBuilder sb, DslDraftRule rule, string paramAlias,
        DslDraftDefinition draft, string terminator)
    {
        if (rule.Value == null) return;
        var valueCode = CompileValueExpression(rule.Value, draft);
        if (valueCode == null) return;

        sb.AppendLine($"            .With({paramAlias} => {paramAlias}.{rule.Attribute} = {valueCode}){terminator}");
    }

    private void EmitWithDefaultLine(StringBuilder sb, DslDraftRule rule, string paramAlias,
        DslDraftDefinition draft, Dictionary<string, string> refAliases, string terminator)
    {
        if (rule.Value is DslDraftReferenceValue refVal)
        {
            if (refVal.Self)
            {
                var chain = BuildReferenceChain(refVal);
                sb.AppendLine($"            .WithDefault({paramAlias} => {paramAlias}.{rule.Attribute}, () => {chain}){terminator}");
                return;
            }

            // Explicit refAlias on the value — use it directly
            if (!string.IsNullOrEmpty(refVal.RefAlias))
            {
                var chain = new StringBuilder();
                chain.Append($"{refVal.RefAlias}.Value");
                if (!string.IsNullOrEmpty(refVal.Transform))
                    chain.Append($".{refVal.Transform}()");
                sb.AppendLine($"            .WithDefault({paramAlias} => {paramAlias}.{rule.Attribute}, () => {chain}){terminator}");
                return;
            }

            // Auto-detected multi-use ref alias
            if (refAliases.TryGetValue(refVal.Draft, out var alias))
            {
                var chain = new StringBuilder();
                chain.Append($"{alias}.Value");
                if (!string.IsNullOrEmpty(refVal.Transform))
                    chain.Append($".{refVal.Transform}()");
                sb.AppendLine($"            .WithDefault({paramAlias} => {paramAlias}.{rule.Attribute}, () => {chain}){terminator}");
                return;
            }

            // Single-use shorthand: .WithDefault(a => a.Bid, DraftValidB) implies .Build().ToEntityReference()
            if (refVal.Build && refVal.Transform == "ToEntityReference")
            {
                sb.AppendLine($"            .WithDefault({paramAlias} => {paramAlias}.{rule.Attribute}, {refVal.Draft}){terminator}");
                return;
            }

            // Full lambda form
            var lambdaChain = BuildReferenceChain(refVal);
            sb.AppendLine($"            .WithDefault({paramAlias} => {paramAlias}.{rule.Attribute}, () => {lambdaChain}){terminator}");
        }
        else
        {
            var valueCode = CompileValueExpression(rule.Value!, draft);
            if (valueCode == null) return;
            sb.AppendLine($"            .WithDefault({paramAlias} => {paramAlias}.{rule.Attribute}, () => {valueCode}){terminator}");
        }
    }

    private static string BuildReferenceChain(DslDraftReferenceValue reference)
    {
        var chain = new StringBuilder();
        chain.Append($"{reference.Draft}()");

        if (reference.Build)
            chain.Append(".Build()");

        if (!string.IsNullOrEmpty(reference.Transform))
            chain.Append($".{reference.Transform}()");

        return chain.ToString();
    }

    private string? CompileValueExpression(DslDraftValue value, DslDraftDefinition draft)
    {
        return value switch
        {
            DslDraftConstantValue constant => CompileConstant(constant),
            DslDraftEnumValue enumVal => $"{enumVal.EnumType}.{enumVal.Value}",
            DslDraftReferenceValue reference => BuildReferenceChain(reference),
            _ => EmitUnsupportedValue(value, draft)
        };
    }

    private string? EmitUnsupportedValue(DslDraftValue value, DslDraftDefinition draft)
    {
        _diagnostics.Add(new DslDiagnostic
        {
            Code = ProducerDslDiagnosticCodes.UnsupportedValueKind,
            Message = $"Unknown value kind '{value.Kind}' in draft '{draft.Id}'.",
            Location = new DslDiagnosticLocation { Section = "rules" }
        });
        return null;
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

    private void ValidateDsl(DslProducerDefinition definition)
    {
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

        foreach (var draft in definition.Drafts)
        {
            foreach (var rule in draft.Rules)
            {
                if (rule.Value is not DslDraftReferenceValue refVal) continue;

                if (refVal.Draft == draft.Id && !refVal.Self)
                {
                    _diagnostics.Add(new DslDiagnostic
                    {
                        Code = ProducerDslDiagnosticCodes.SelfReferenceMissing,
                        Message = $"Draft '{draft.Id}' references itself but 'self' is not set to true.",
                        Location = new DslDiagnosticLocation { Section = "rules" }
                    });
                }

                if (!refVal.Self && !definition.Drafts.Any(d => d.Id == refVal.Draft))
                {
                    _diagnostics.Add(new DslDiagnostic
                    {
                        Code = ProducerDslDiagnosticCodes.UnresolvedDraftReference,
                        Message = $"Draft '{draft.Id}' references unknown draft '{refVal.Draft}'.",
                        Location = new DslDiagnosticLocation { Section = "rules", Hint = refVal.Draft }
                    });
                }
            }
        }
    }

    private static string DeriveParamName(string entityName)
    {
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
