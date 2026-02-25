using TestEngine.Models.Dsl;

namespace TestEngine.Services.DslCompiler;

internal sealed class ValueCompiler : DslSubcomponentBase
{
    private string? _actResultVar;

    public ValueCompiler(List<DslDiagnostic> diagnostics) : base(diagnostics) { }

    internal void SetActResultVar(string? resultVar) => _actResultVar = resultVar;

    public string CompileValue(DslValueExpression value) => value switch
    {
        DslStringValue s        => $"\"{EscapeString(s.Value)}\"",
        DslNumberValue n        => FormatNumber(n.Value),
        DslBooleanValue b       => b.Value ? "true" : "false",
        DslGuidValue g          => $"new Guid(\"{g.Value}\")",
        DslNullValue            => "null",
        DslEnumValue e          => $"{e.EnumType}.{e.Member}",
        DslEnumNumberValue en   => $"({en.EnumType}){en.Value}",
        DslInterpolationValue i => CompileInterpolation(i.Template),
        DslRefValue r           => CompileRef(r.Ref),
        _                       => "/* unknown value */"
    };

    public string CompileWhereExpression(DslWhereExpression where, string alias) => where.Op switch
    {
        "eq" => $"{CompileMemberExpr(where.Left, alias)} == {CompileValue(where.Right ?? new DslNullValue())}",
        "and" when where.Items != null
             => string.Join(" && ", where.Items.Select(i => CompileWhereExpression(i, alias))),
        _    => $"/* unsupported where op: {where.Op} */"
    };

    public string CompileMemberExpr(DslMemberExpr? member, string alias)
    {
        if (member == null) return "/* missing member */";
        var root = member.Root == "alias" ? alias : member.Root;
        return $"{root}.{string.Join(".", member.Path)}";
    }

    public string CompileAssertionTarget(DslAssertionTarget target, HashSet<string> notNullVars) =>
        target.Kind switch
        {
            "var"    => target.Name ?? "/* missing var */",
            "member" => CompileMemberTarget(target, notNullVars),
            _        => "/* unknown target kind */"
        };

    public string CompilePredicateExpression(DslPredicate predicate)
    {
        var leftPath = string.Join(".", predicate.Left.Path);
        var right = CompileValue(predicate.Right);
        return $"{predicate.Alias} => {predicate.Alias}.{leftPath} == {right}";
    }

    public static string CompileEntityRef(DslEntityRef? entity)
    {
        if (entity == null) return "/* missing entity */";
        return $"{entity.FromBinding}.{entity.Member}";
    }

    public static string ToCSharpProducerCall(string dslCall)
    {
        var parts = dslCall.Split('.');
        return parts.Length == 3 ? $"Producer.{parts[2]}" : dslCall;
    }

    public static string DeriveLambdaParam(string producerCall)
    {
        var parts = producerCall.Split('.');
        var methodName = parts.Length > 1 ? parts[^1] : producerCall;

        var entityName = methodName;
        if (methodName.StartsWith("DraftValid", StringComparison.Ordinal))
            entityName = methodName["DraftValid".Length..];
        else if (methodName.StartsWith("DraftInvalid", StringComparison.Ordinal))
            entityName = methodName["DraftInvalid".Length..];
        else if (methodName.StartsWith("Draft", StringComparison.Ordinal))
            entityName = methodName["Draft".Length..];

        return entityName.Length > 0 ? entityName[..1].ToLowerInvariant() : "x";
    }

    public static string DeriveClassName(string testName)
    {
        var parts = testName.Split('_');
        var baseName = parts[0];
        return baseName.EndsWith("Tests", StringComparison.Ordinal) ? baseName : baseName + "Tests";
    }

    public static string EscapeString(string value) =>
        value.Replace("\\", "\\\\")
             .Replace("\"", "\\\"")
             .Replace("\n", "\\n")
             .Replace("\r", "\\r")
             .Replace("\t", "\\t");

    private string CompileInterpolation(string template) =>
        $"$\"{template.Replace("${", "{")}\"";

    private string CompileRef(DslRefExpr refExpr) => refExpr.Kind switch
    {
        "bindingVar" when refExpr.Member != null => $"{refExpr.Id}.{refExpr.Member}",
        "bindingVar" when refExpr.Call != null   => $"{refExpr.Id}.{refExpr.Call}()",
        "bindingVar"                             => refExpr.Id ?? "/* unresolved ref */",
        "actResult"                              => _actResultVar ?? "/* unresolved actResult */",
        _                                        => "/* unknown ref kind */"
    };

    private string CompileMemberTarget(DslAssertionTarget target, HashSet<string> notNullVars)
    {
        var rootVar = target.RootVar ?? "/* missing root */";
        var path = target.Path != null ? string.Join(".", target.Path) : "";
        var accessor = notNullVars.Contains(rootVar) ? "." : "?.";
        return $"{rootVar}{accessor}{path}";
    }

    private static string FormatNumber(double value)
    {
        if (value == Math.Truncate(value) && !double.IsInfinity(value))
            return ((long)value).ToString();
        return value.ToString("G");
    }
}
