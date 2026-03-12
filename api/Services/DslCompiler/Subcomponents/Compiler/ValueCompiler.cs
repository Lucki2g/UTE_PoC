using TestEngine.Models.Dsl;

namespace TestEngine.Services.DslCompiler;

internal sealed class ValueCompiler : DslSubcomponentBase
{
    private string? _actResultVar;
    private readonly IEntitySchemaService? _schema;

    public ValueCompiler(List<DslDiagnostic> diagnostics, IEntitySchemaService? schema = null)
        : base(diagnostics)
    {
        _schema = schema;
    }

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

    public string CompileWhereExpression(DslWhereExpression where, string alias, string? entitySet = null) => where.Op switch
    {
        "==" or "eq"  => $"{CompileMemberExpr(where.Left, alias, entitySet)} == {CompileValue(where.Right ?? new DslNullValue())}",
        "!=" or "neq" => $"{CompileMemberExpr(where.Left, alias, entitySet)} != {CompileValue(where.Right ?? new DslNullValue())}",
        "<"  or "lt"  => $"{CompileMemberExpr(where.Left, alias, entitySet)} < {CompileValue(where.Right ?? new DslNullValue())}",
        "<=" or "lte" => $"{CompileMemberExpr(where.Left, alias, entitySet)} <= {CompileValue(where.Right ?? new DslNullValue())}",
        ">"  or "gt"  => $"{CompileMemberExpr(where.Left, alias, entitySet)} > {CompileValue(where.Right ?? new DslNullValue())}",
        ">=" or "gte" => $"{CompileMemberExpr(where.Left, alias, entitySet)} >= {CompileValue(where.Right ?? new DslNullValue())}",
        "and" when where.Items != null
              => string.Join(" && ", where.Items.Select(i => CompileWhereExpression(i, alias, entitySet))),
        "or" when where.Items != null
              => string.Join(" || ", where.Items.Select(i => CompileWhereExpression(i, alias, entitySet))),
        _     => $"/* unsupported where op: {where.Op} */"
    };

    public string CompileMemberExpr(DslMemberExpr? member, string alias, string? entitySet = null)
    {
        if (member == null) return "/* missing member */";
        var root = member.Root == "alias" ? alias : member.Root;
        var resolvedPath = entitySet != null
            ? member.Path.Select(p => ResolvePropertyName(entitySet, p))
            : member.Path;
        return $"{root}.{string.Join(".", resolvedPath)}";
    }

    /// <summary>Resolves a logical property name to its C# property name for the given entity set.</summary>
    public string ResolveEntityProperty(string entitySet, string identifier) => ResolvePropertyName(entitySet, identifier);

    private string ResolvePropertyName(string entitySet, string identifier)
    {
        if (_schema == null) return identifier;
        var logicalName = _schema.ResolveEntityLogicalNameAsync(entitySet).GetAwaiter().GetResult();
        if (logicalName == null) return identifier;
        var columns = _schema.GetColumnsAsync(logicalName).GetAwaiter().GetResult();
        var match = columns.FirstOrDefault(c =>
            string.Equals(c.LogicalName, identifier, StringComparison.OrdinalIgnoreCase));
        return match?.PropertyName ?? identifier;
    }

    public string CompileAssertionTarget(
        DslAssertionTarget target,
        HashSet<string> notNullVars,
        IReadOnlyDictionary<string, string>? retrievalEntityMap = null) =>
        target.Kind switch
        {
            "var"    => target.Name ?? "/* missing var */",
            "member" => CompileMemberTarget(target, notNullVars, retrievalEntityMap),
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
        return string.IsNullOrEmpty(entity.Member)
            ? entity.FromBinding
            : $"{entity.FromBinding}.{entity.Member}";
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
        ("bindingVar" or "binding") when refExpr.Call != null   => $"{refExpr.Id}.{refExpr.Call}()",
        ("bindingVar" or "binding") when refExpr.Member != null => $"{refExpr.Id}.{refExpr.Member}",
        ("bindingVar" or "binding")                             => refExpr.Id ?? "/* unresolved ref */",
        "actResult"                                             => _actResultVar ?? "/* unresolved actResult */",
        _                                                       => "/* unknown ref kind */"
    };

    private string CompileMemberTarget(
        DslAssertionTarget target,
        HashSet<string> notNullVars,
        IReadOnlyDictionary<string, string>? retrievalEntityMap = null)
    {
        var rootVar = target.RootVar ?? "/* missing root */";
        var accessor = notNullVars.Contains(rootVar) ? "." : "?.";

        if (target.Path == null || target.Path.Count == 0)
            return $"{rootVar}{accessor}";

        IEnumerable<string> resolvedPath = target.Path;
        if (retrievalEntityMap != null && retrievalEntityMap.TryGetValue(rootVar, out var entitySet))
            resolvedPath = target.Path.Select(p => ResolvePropertyName(entitySet, p));

        return $"{rootVar}{accessor}{string.Join(".", resolvedPath)}";
    }

    private static string FormatNumber(double value)
    {
        if (value == Math.Truncate(value) && !double.IsInfinity(value))
            return ((long)value).ToString();
        return value.ToString("G");
    }
}
