using System.Text;
using TestEngine.Models.Dsl;

namespace TestEngine.Services;

internal class DslToCSharpCompiler
{
    private readonly DslCompileOptions _options;
    private readonly List<DslDiagnostic> _diagnostics = [];
    private string? _actResultVar;

    public DslToCSharpCompiler(DslCompileOptions options)
    {
        _options = options;
    }

    public DslCompileResult Compile(DslTestDefinition definition)
    {
        var test = definition.Test;
        var sb = new StringBuilder();

        if (_options.EmitClassShell)
            EmitClassHeader(sb, test);

        EmitMethodAttributes(sb, test);
        EmitMethodSignature(sb, test);
        EmitMethodBody(sb, test);

        if (_options.EmitClassShell)
            EmitClassFooter(sb);

        return new DslCompileResult
        {
            CSharpCode = sb.ToString(),
            Diagnostics = _diagnostics
        };
    }

    private void EmitClassHeader(StringBuilder sb, DslTest test)
    {
        var ns = _options.Namespace ?? "IntegrationTests";
        var className = _options.ClassName ?? DeriveClassName(test.Name);

        sb.AppendLine($"namespace {ns};");
        sb.AppendLine();

        if (test.Framework == "mstest")
            sb.AppendLine("[TestClass]");
        else if (test.Framework == "nunit")
            sb.AppendLine("[TestFixture]");

        sb.AppendLine($"public class {className} : {_options.BaseClass}");
        sb.AppendLine("{");
        sb.AppendLine($"    public {className}({_options.FixtureType} fixture)");
        sb.AppendLine("        : base(fixture)");
        sb.AppendLine("    {");
        sb.AppendLine("    }");
        sb.AppendLine();
    }

    private void EmitClassFooter(StringBuilder sb)
    {
        sb.AppendLine("}");
    }

    private void EmitMethodAttributes(StringBuilder sb, DslTest test)
    {
        var indent = _options.EmitClassShell ? "    " : "";

        // Traits
        if (test.Traits != null)
        {
            foreach (var (key, values) in test.Traits)
            {
                foreach (var value in values)
                {
                    switch (test.Framework)
                    {
                        case "xunit":
                            sb.AppendLine($"{indent}[Trait(\"{key}\", \"{value}\")]");
                            break;
                        case "mstest" when key.Equals("category", StringComparison.OrdinalIgnoreCase):
                            sb.AppendLine($"{indent}[TestCategory(\"{value}\")]");
                            break;
                        case "nunit" when key.Equals("category", StringComparison.OrdinalIgnoreCase):
                            sb.AppendLine($"{indent}[Category(\"{value}\")]");
                            break;
                    }
                }
            }
        }

        // Timeout
        if (test.TimeoutMs.HasValue)
        {
            switch (test.Framework)
            {
                case "mstest":
                case "nunit":
                    sb.AppendLine($"{indent}[Timeout({test.TimeoutMs.Value})]");
                    break;
                case "xunit":
                    _diagnostics.Add(new DslDiagnostic
                    {
                        Code = DslDiagnosticCodes.UnsupportedTimeoutXunit,
                        Message = $"xUnit does not have a built-in [Timeout] attribute. Requested timeout: {test.TimeoutMs.Value}ms.",
                        Location = new DslDiagnosticLocation { Section = "test", Hint = $"timeoutMs: {test.TimeoutMs.Value}" }
                    });
                    break;
            }
        }

        // Ignore (must come before or merge with the test attribute for xUnit)
        if (test.Ignore != null && test.Framework != "xunit")
        {
            sb.AppendLine($"{indent}[Ignore(\"{EscapeString(test.Ignore.Reason)}\")]");
        }

        // Test attribute
        switch (test.Framework)
        {
            case "xunit":
                var attr = test.Kind == "theory" ? "Theory" : "Fact";
                if (test.Ignore != null)
                    sb.AppendLine($"{indent}[{attr}(Skip = \"{EscapeString(test.Ignore.Reason)}\")]");
                else
                    sb.AppendLine($"{indent}[{attr}]");
                break;
            case "mstest":
                sb.AppendLine($"{indent}[TestMethod]");
                break;
            case "nunit":
                sb.AppendLine($"{indent}[Test]");
                break;
        }
    }

    private void EmitMethodSignature(StringBuilder sb, DslTest test)
    {
        var indent = _options.EmitClassShell ? "    " : "";
        var asyncMod = test.Async ? "async " : "";
        var returnType = test.Async ? "Task" : "void";
        sb.AppendLine($"{indent}public {asyncMod}{returnType} {test.Name}()");
    }

    private void EmitMethodBody(StringBuilder sb, DslTest test)
    {
        var indent = _options.EmitClassShell ? "    " : "";
        var bodyIndent = indent + "    ";

        sb.AppendLine($"{indent}{{");

        // Arrange
        sb.AppendLine($"{bodyIndent}// Arrange");
        EmitArrangeSection(sb, test.Arrange, bodyIndent);

        sb.AppendLine();

        // Act
        sb.AppendLine($"{bodyIndent}// Act");
        EmitActSection(sb, test.Act, test, bodyIndent);

        sb.AppendLine();

        // Assert
        sb.AppendLine($"{bodyIndent}// Assert");
        EmitAssertSection(sb, test.Assert, test, bodyIndent);

        sb.AppendLine($"{indent}}}");
    }

    // --- Arrange ---

    private void EmitArrangeSection(StringBuilder sb, DslArrange arrange, string indent)
    {
        foreach (var binding in arrange.Bindings)
        {
            EmitBinding(sb, binding, indent);
        }
    }

    private void EmitBinding(StringBuilder sb, DslBinding binding, string indent)
    {
        var producerCall = binding.Producer.Call;
        var hasWith = binding.Producer.With.Count > 0;
        var hasBuild = binding.Build;

        if (!hasWith && !hasBuild)
        {
            sb.AppendLine($"{indent}var {binding.Var} = {producerCall}();");
            return;
        }

        sb.Append($"{indent}var {binding.Var} = {producerCall}()");

        var lambdaParam = DeriveLambdaParam(producerCall);

        foreach (var mutation in binding.Producer.With)
        {
            var value = CompileValue(mutation.Value);
            sb.AppendLine();
            sb.Append($"{indent}    .With({lambdaParam} => {lambdaParam}.{mutation.Path} = {value})");
        }

        if (hasBuild)
        {
            sb.AppendLine();
            sb.Append($"{indent}    .Build()");
        }

        sb.AppendLine(";");
    }

    // --- Act ---

    private void EmitActSection(StringBuilder sb, DslAct act, DslTest test, string indent)
    {
        _actResultVar = act.ResultVar;
        var op = act.Operation;
        var awaitPrefix = op.Awaited && test.Async ? "await " : "";

        var call = op.Kind switch
        {
            "create" => EmitCreateCall(op, awaitPrefix),
            "update" => EmitUpdateCall(op, awaitPrefix),
            "delete" => EmitDeleteCall(op, awaitPrefix),
            "associate" => EmitAssociateCall(op, awaitPrefix),
            "disassociate" => EmitDisassociateCall(op, awaitPrefix),
            _ => EmitUnknownOperation(op)
        };

        if (act.ResultVar != null)
            sb.AppendLine($"{indent}var {act.ResultVar} = {call};");
        else
            sb.AppendLine($"{indent}{call};");
    }

    private string EmitCreateCall(DslOperation op, string awaitPrefix)
    {
        var entityArg = CompileEntityRef(op.Entity);
        var generic = op.GenericType != null ? $"<{op.GenericType}>" : "";
        var method = op.Awaited ? (op.UnawaitedVariant ? "CreateUnawaitedAsync" : "CreateAsync") : "Create";
        return $"{awaitPrefix}AdminDao.{method}{generic}({entityArg})";
    }

    private string EmitUpdateCall(DslOperation op, string awaitPrefix)
    {
        var entityArg = CompileEntityRef(op.Entity);
        var generic = op.GenericType != null ? $"<{op.GenericType}>" : "";
        var method = op.Awaited ? (op.UnawaitedVariant ? "UpdateUnawaitedAsync" : "UpdateAsync") : "Update";
        return $"{awaitPrefix}AdminDao.{method}{generic}({entityArg})";
    }

    private string EmitDeleteCall(DslOperation op, string awaitPrefix)
    {
        var idArg = op.Id != null ? CompileValue(op.Id) : "/* missing id */";
        var generic = op.GenericType != null ? $"<{op.GenericType}>" : "";
        var method = op.Awaited ? (op.UnawaitedVariant ? "DeleteUnawaitedAsync" : "DeleteAsync") : "Delete";
        return $"{awaitPrefix}AdminDao.{method}{generic}({idArg})";
    }

    private string EmitAssociateCall(DslOperation op, string awaitPrefix)
    {
        return EmitRelationshipCall(op, awaitPrefix, "Associate");
    }

    private string EmitDisassociateCall(DslOperation op, string awaitPrefix)
    {
        return EmitRelationshipCall(op, awaitPrefix, "Disassociate");
    }

    private string EmitRelationshipCall(DslOperation op, string awaitPrefix, string verb)
    {
        var targetArg = op.Target != null ? CompileValue(op.Target) : "/* missing target */";
        var relatedArg = op.Related != null ? CompileValue(op.Related.Value) : "/* missing related */";
        var relName = op.RelationshipName != null ? $"\"{op.RelationshipName}\"" : "/* missing relationship */";

        var methodBase = $"{verb}Entities";
        var method = op.Awaited
            ? (op.UnawaitedVariant ? $"{methodBase}UnawaitedAsync" : $"{methodBase}Async")
            : methodBase;

        return $"{awaitPrefix}AdminDao.{method}({relName}, {targetArg}, {relatedArg})";
    }

    private string EmitUnknownOperation(DslOperation op)
    {
        _diagnostics.Add(new DslDiagnostic
        {
            Code = DslDiagnosticCodes.UnknownOperationKind,
            Message = $"Unknown operation kind: '{op.Kind}'",
            Location = new DslDiagnosticLocation { Section = "act" }
        });
        return $"/* UNKNOWN OPERATION: {op.Kind} */";
    }

    // --- Assert ---

    private void EmitAssertSection(StringBuilder sb, DslAssert assert, DslTest test, string indent)
    {
        // Track which variables have had notNull assertions for null-conditional policy
        var notNullVars = new HashSet<string>();
        foreach (var a in assert.Assertions)
        {
            if (a.Kind == "notNull" && a.Target.Kind == "var" && a.Target.Name != null)
                notNullVars.Add(a.Target.Name);
        }

        // Retrievals
        foreach (var retrieval in assert.Retrievals)
        {
            EmitRetrieval(sb, retrieval, test, indent);
        }

        if (assert.Retrievals.Count > 0 && assert.Assertions.Count > 0)
            sb.AppendLine();

        // Assertions
        foreach (var assertion in assert.Assertions)
        {
            EmitAssertion(sb, assertion, notNullVars, indent);
        }
    }

    private void EmitRetrieval(StringBuilder sb, DslRetrieval retrieval, DslTest test, string indent)
    {
        var method = retrieval.Kind switch
        {
            "retrieveFirstOrDefault" => "RetrieveFirstOrDefault",
            "retrieveFirst" => "RetrieveFirst",
            "retrieveSingle" => "RetrieveSingle",
            "retrieveList" => "RetrieveList",
            _ => retrieval.Kind
        };

        var whereExpr = CompileWhereExpression(retrieval.Where, retrieval.Alias);
        var awaitPrefix = test.Async ? "await " : "";
        var asyncSuffix = test.Async ? "Async" : "";

        sb.AppendLine($"{indent}var {retrieval.Var} = {awaitPrefix}AdminDao.{method}{asyncSuffix}(");
        sb.AppendLine($"{indent}    xrm => xrm.{retrieval.EntitySet}.Where({retrieval.Alias} => {whereExpr}));");
    }

    private void EmitAssertion(StringBuilder sb, DslAssertion assertion, HashSet<string> notNullVars, string indent)
    {
        var target = CompileAssertionTarget(assertion.Target, notNullVars);

        switch (assertion.Kind)
        {
            case "notNull":
                sb.AppendLine($"{indent}{target}.Should().NotBeNull();");
                break;
            case "be":
                var expected = assertion.Expected != null ? CompileValue(assertion.Expected) : "null";
                sb.AppendLine($"{indent}{target}.Should().Be({expected});");
                break;
            case "containSingle":
                if (assertion.Predicate != null)
                {
                    var pred = CompilePredicateExpression(assertion.Predicate);
                    sb.AppendLine($"{indent}{target}.Should().ContainSingle({pred});");
                }
                else
                {
                    sb.AppendLine($"{indent}{target}.Should().ContainSingle();");
                }
                break;
            default:
                _diagnostics.Add(new DslDiagnostic
                {
                    Code = DslDiagnosticCodes.UnsupportedAssertion,
                    Message = $"Unsupported assertion kind: '{assertion.Kind}'",
                    Location = new DslDiagnosticLocation { Section = "assert" }
                });
                sb.AppendLine($"{indent}/* UNSUPPORTED ASSERTION: {assertion.Kind} */");
                break;
        }
    }

    // --- Value Compilation ---

    private string CompileValue(DslValueExpression value)
    {
        return value switch
        {
            DslStringValue s => $"\"{EscapeString(s.Value)}\"",
            DslNumberValue n => FormatNumber(n.Value),
            DslBooleanValue b => b.Value ? "true" : "false",
            DslGuidValue g => $"new Guid(\"{g.Value}\")",
            DslNullValue => "null",
            DslEnumValue e => $"{e.EnumType}.{e.Member}",
            DslEnumNumberValue en => $"({en.EnumType}){en.Value}",
            DslInterpolationValue i => CompileInterpolation(i.Template),
            DslRefValue r => CompileRef(r.Ref),
            _ => "/* unknown value */"
        };
    }

    private string CompileInterpolation(string template)
    {
        // Convert DSL template format ${expr} to C# interpolation {expr}
        var csharp = template.Replace("${", "{");
        return $"$\"{csharp}\"";
    }

    private string CompileRef(DslRefExpr refExpr)
    {
        return refExpr.Kind switch
        {
            "bindingVar" when refExpr.Member != null => $"{refExpr.Id}.{refExpr.Member}",
            "bindingVar" when refExpr.Call != null => $"{refExpr.Id}.{refExpr.Call}()",
            "bindingVar" => refExpr.Id ?? "/* unresolved ref */",
            "actResult" => _actResultVar ?? "/* unresolved actResult */",
            _ => "/* unknown ref kind */"
        };
    }

    private static string CompileEntityRef(DslEntityRef? entity)
    {
        if (entity == null) return "/* missing entity */";
        return $"{entity.FromBinding}.{entity.Member}";
    }

    private string CompileWhereExpression(DslWhereExpression where, string alias)
    {
        return where.Op switch
        {
            "eq" => $"{CompileMemberExpr(where.Left, alias)} == {CompileWhereRight(where.Right)}",
            "and" when where.Items != null => string.Join(" && ", where.Items.Select(i => CompileWhereExpression(i, alias))),
            _ => $"/* unsupported where op: {where.Op} */"
        };
    }

    private string CompileMemberExpr(DslMemberExpr? member, string alias)
    {
        if (member == null) return "/* missing member */";
        var root = member.Root == "alias" ? alias : member.Root;
        return $"{root}.{string.Join(".", member.Path)}";
    }

    private string CompileWhereRight(DslValueExpression? value)
    {
        if (value == null) return "/* missing value */";
        return CompileValue(value);
    }

    private string CompileAssertionTarget(DslAssertionTarget target, HashSet<string> notNullVars)
    {
        return target.Kind switch
        {
            "var" => target.Name ?? "/* missing var */",
            "member" => CompileMemberTarget(target, notNullVars),
            _ => "/* unknown target kind */"
        };
    }

    private string CompileMemberTarget(DslAssertionTarget target, HashSet<string> notNullVars)
    {
        var rootVar = target.RootVar ?? "/* missing root */";
        var path = target.Path != null ? string.Join(".", target.Path) : "";

        // Use null-conditional if no prior notNull assertion on this root var
        var accessor = notNullVars.Contains(rootVar) ? "." : "?.";
        return $"{rootVar}{accessor}{path}";
    }

    private string CompilePredicateExpression(DslPredicate predicate)
    {
        var leftPath = string.Join(".", predicate.Left.Path);
        var right = CompileValue(predicate.Right);
        return $"{predicate.Alias} => {predicate.Alias}.{leftPath} == {right}";
    }

    // --- Helpers ---

    private static string DeriveLambdaParam(string producerCall)
    {
        // Extract entity name from "Producer.DraftValidAccount" -> "Account" -> "a"
        var parts = producerCall.Split('.');
        var methodName = parts.Length > 1 ? parts[^1] : producerCall;

        // Try to find entity name after "DraftValid" or "Draft"
        var entityName = methodName;
        if (methodName.StartsWith("DraftValid", StringComparison.Ordinal))
            entityName = methodName["DraftValid".Length..];
        else if (methodName.StartsWith("Draft", StringComparison.Ordinal))
            entityName = methodName["Draft".Length..];

        return entityName.Length > 0 ? entityName[..1].ToLowerInvariant() : "x";
    }

    private static string DeriveClassName(string testName)
    {
        // Split on underscore, take first part and append "Tests" if not already there
        var parts = testName.Split('_');
        var baseName = parts[0];
        return baseName.EndsWith("Tests", StringComparison.Ordinal) ? baseName : baseName + "Tests";
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

    private static string FormatNumber(double value)
    {
        // Emit as integer if whole number, otherwise as double
        if (value == Math.Truncate(value) && !double.IsInfinity(value))
            return ((long)value).ToString();
        return value.ToString("G");
    }
}
