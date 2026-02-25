using Microsoft.CodeAnalysis;
using Microsoft.CodeAnalysis.CSharp;
using Microsoft.CodeAnalysis.CSharp.Syntax;
using TestEngine.Models.Dsl;

namespace TestEngine.Services.DslCompiler;

internal sealed class AssertParser : DslSubcomponentBase
{
    private readonly ExpressionDecompiler _expr;
    private readonly IReadOnlyDictionary<string, IAssertionFunctionParser> _registry;

    public AssertParser(
        List<DslDiagnostic> diagnostics,
        ExpressionDecompiler expr,
        IEnumerable<IAssertionFunctionParser> functions)
        : base(diagnostics)
    {
        _expr = expr;
        _registry = functions.ToDictionary(f => f.MethodName, StringComparer.Ordinal);
    }

    public (List<DslRetrieval> retrievals, List<DslAssertion> assertions)
        ParseAssertSection(List<StatementSyntax> statements)
    {
        var retrievals = new List<DslRetrieval>();
        var assertions = new List<DslAssertion>();

        foreach (var stmt in statements)
        {
            if (stmt is LocalDeclarationStatementSyntax localDecl)
            {
                var variable = localDecl.Declaration.Variables.FirstOrDefault();
                if (variable?.Initializer?.Value != null)
                {
                    var retrieval = TryParseRetrieval(variable.Identifier.Text, variable.Initializer.Value);
                    if (retrieval != null) { retrievals.Add(retrieval); continue; }
                }
            }

            if (stmt is ExpressionStatementSyntax exprStmt)
            {
                var assertion = TryParseAssertion(exprStmt.Expression);
                if (assertion != null) assertions.Add(assertion);
            }
        }

        return (retrievals, assertions);
    }

    private DslRetrieval? TryParseRetrieval(string varName, ExpressionSyntax expr)
    {
        if (expr is AwaitExpressionSyntax awaitExpr)
            expr = awaitExpr.Expression;

        if (expr is not InvocationExpressionSyntax invocation) return null;
        if (invocation.Expression is not MemberAccessExpressionSyntax memberAccess) return null;

        var receiver = memberAccess.Expression.ToString();
        if (!receiver.Contains("AdminDao")) return null;

        var methodName = memberAccess.Name.Identifier.Text
            .Replace("UnawaitedAsync", "")
            .Replace("Async", "");

        var kind = methodName switch
        {
            "RetrieveFirstOrDefault" => "retrieveFirstOrDefault",
            "RetrieveFirst"          => "retrieveFirst",
            "RetrieveSingle"         => "retrieveSingle",
            "RetrieveList"           => "retrieveList",
            _                        => null
        };

        if (kind == null) return null;
        if (invocation.ArgumentList.Arguments.Count == 0) return null;

        var lambdaArg = invocation.ArgumentList.Arguments[0].Expression;
        return ParseRetrievalLambda(varName, kind, lambdaArg);
    }

    private DslRetrieval? ParseRetrievalLambda(string varName, string kind, ExpressionSyntax lambdaExpr)
    {
        ExpressionSyntax? body = null;

        if (lambdaExpr is SimpleLambdaExpressionSyntax simpleLambda)
            body = simpleLambda.Body as ExpressionSyntax;
        else if (lambdaExpr is ParenthesizedLambdaExpressionSyntax parenLambda)
            body = parenLambda.Body as ExpressionSyntax;

        if (body == null) return null;

        // Pattern 1: xrm.AccountSet.Where(a => a.Id == value)
        if (body is InvocationExpressionSyntax whereInvocation &&
            whereInvocation.Expression is MemberAccessExpressionSyntax whereAccess &&
            whereAccess.Name.Identifier.Text == "Where")
        {
            string? entitySet = null;
            if (whereAccess.Expression is MemberAccessExpressionSyntax entitySetAccess)
                entitySet = entitySetAccess.Name.Identifier.Text;

            if (entitySet == null) return null;
            if (whereInvocation.ArgumentList.Arguments.Count == 0) return null;

            var whereArg = whereInvocation.ArgumentList.Arguments[0].Expression;
            var (alias, whereExpr) = ParseWhereLambda(whereArg);

            if (whereExpr == null)
            {
                AddDiagnostic(
                    DslDiagnosticCodes.UnsupportedLinqShape,
                    $"Could not parse Where predicate in retrieval for '{varName}'.",
                    section: "assert",
                    hint: whereArg.ToString());
                return null;
            }

            return new DslRetrieval { Var = varName, Kind = kind, EntitySet = entitySet, Alias = alias ?? "x", Where = whereExpr };
        }

        // Pattern 2: xrm.AccountSet (no Where)
        if (body is MemberAccessExpressionSyntax directAccess)
        {
            return new DslRetrieval
            {
                Var       = varName,
                Kind      = kind,
                EntitySet = directAccess.Name.Identifier.Text,
                Alias     = "x",
                Where     = null
            };
        }

        return null;
    }

    private (string? alias, DslWhereExpression? expr) ParseWhereLambda(ExpressionSyntax lambdaExpr)
    {
        string? alias = null;
        ExpressionSyntax? body = null;

        if (lambdaExpr is SimpleLambdaExpressionSyntax simpleLambda)
        {
            alias = simpleLambda.Parameter.Identifier.Text;
            body  = simpleLambda.Body as ExpressionSyntax;
        }
        else if (lambdaExpr is ParenthesizedLambdaExpressionSyntax parenLambda)
        {
            alias = parenLambda.ParameterList.Parameters.FirstOrDefault()?.Identifier.Text;
            body  = parenLambda.Body as ExpressionSyntax;
        }

        if (body == null) return (alias, null);
        return (alias, ParseWhereExpression(body, alias));
    }

    private DslWhereExpression? ParseWhereExpression(ExpressionSyntax expr, string? alias)
    {
        if (expr is BinaryExpressionSyntax binary)
        {
            if (binary.IsKind(SyntaxKind.EqualsExpression))
            {
                return new DslWhereExpression
                {
                    Op    = "eq",
                    Left  = ParseMemberExpression(binary.Left, alias),
                    Right = _expr.DecompileExpression(binary.Right)
                };
            }

            if (binary.IsKind(SyntaxKind.LogicalAndExpression))
            {
                var left  = ParseWhereExpression(binary.Left, alias);
                var right = ParseWhereExpression(binary.Right, alias);
                var items = new List<DslWhereExpression>();
                if (left  != null) items.Add(left);
                if (right != null) items.Add(right);
                return new DslWhereExpression { Op = "and", Items = items };
            }
        }

        return null;
    }

    private static DslMemberExpr? ParseMemberExpression(ExpressionSyntax expr, string? alias)
    {
        var parts   = new List<string>();
        var current = expr;

        while (current is MemberAccessExpressionSyntax memberAccess)
        {
            parts.Insert(0, memberAccess.Name.Identifier.Text);
            current = memberAccess.Expression;
        }

        if (current is IdentifierNameSyntax identifier)
        {
            var root = identifier.Identifier.Text;
            return new DslMemberExpr
            {
                Kind = "member",
                Root = root == alias ? "alias" : root,
                Path = parts
            };
        }

        return null;
    }

    private DslAssertion? TryParseAssertion(ExpressionSyntax expr)
    {
        if (expr is not InvocationExpressionSyntax outerInvocation) return null;
        if (outerInvocation.Expression is not MemberAccessExpressionSyntax outerAccess) return null;

        var assertionMethod = outerAccess.Name.Identifier.Text;

        if (outerAccess.Expression is not InvocationExpressionSyntax shouldInvocation) return null;
        if (shouldInvocation.Expression is not MemberAccessExpressionSyntax shouldAccess) return null;
        if (shouldAccess.Name.Identifier.Text != "Should") return null;

        var target = ExtractAssertionTarget(shouldAccess.Expression);

        if (_registry.TryGetValue(assertionMethod, out var parser))
            return parser.Parse(outerInvocation, target);

        AddDiagnostic(
            DslDiagnosticCodes.UnsupportedAssertion,
            $"Unsupported assertion: '.Should().{assertionMethod}(...)'. Only Be, NotBeNull, and ContainSingle are supported.",
            section: "assert",
            hint: expr.ToString());
        return null;
    }

    private static DslAssertionTarget ExtractAssertionTarget(ExpressionSyntax expr)
    {
        // Null-conditional: retrievedAccount?.Name
        if (expr is ConditionalAccessExpressionSyntax conditionalAccess)
        {
            var rootVar = conditionalAccess.Expression.ToString();
            if (conditionalAccess.WhenNotNull is MemberBindingExpressionSyntax memberBinding)
            {
                return new DslAssertionTarget
                {
                    Kind    = "member",
                    RootVar = rootVar,
                    Path    = [memberBinding.Name.Identifier.Text]
                };
            }
            return new DslAssertionTarget { Kind = "var", Name = rootVar };
        }

        // Member access: retrievedAccount.Name
        if (expr is MemberAccessExpressionSyntax memberAccess)
        {
            var parts   = new List<string>();
            var current = (ExpressionSyntax)memberAccess;

            while (current is MemberAccessExpressionSyntax ma)
            {
                parts.Insert(0, ma.Name.Identifier.Text);
                current = ma.Expression;
            }

            if (current is IdentifierNameSyntax id)
            {
                if (parts.Count > 0)
                    return new DslAssertionTarget { Kind = "member", RootVar = id.Identifier.Text, Path = parts };
                return new DslAssertionTarget { Kind = "var", Name = id.Identifier.Text };
            }
        }

        // Simple identifier
        if (expr is IdentifierNameSyntax identifier)
            return new DslAssertionTarget { Kind = "var", Name = identifier.Identifier.Text };

        return new DslAssertionTarget { Kind = "var", Name = expr.ToString() };
    }
}
