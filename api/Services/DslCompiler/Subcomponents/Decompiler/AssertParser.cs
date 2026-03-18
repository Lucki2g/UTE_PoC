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

    /// <summary>
    /// Handles the form: retrievedOrder?.ape_orderstatus.Should().Be(x)
    ///                or: retrievedOrder?.ape_orderid.Id.Should().Be(x)
    /// where the entire expression is a ConditionalAccessExpression because of the ?. operator.
    ///
    /// AST shape of WhenNotNull:
    ///   InvocationExpr [Be(x)]
    ///     MemberAccess [.Be]
    ///       InvocationExpr [Should()]
    ///         MemberAccess [.Should]
    ///           MemberAccess [.ape_orderstatus]  (or chain .ape_orderid.Id)
    ///             MemberBindingExpr [?.implicit]
    /// </summary>
    private DslAssertion? TryParseConditionalAssertion(ConditionalAccessExpressionSyntax conditionalAssert)
    {
        var rootVar = conditionalAssert.Expression.ToString();

        // WhenNotNull must be the outermost invocation (e.g. Be(...))
        if (conditionalAssert.WhenNotNull is not InvocationExpressionSyntax outerInvocation) return null;
        if (outerInvocation.Expression is not MemberAccessExpressionSyntax outerAccess) return null;

        var assertionMethod = outerAccess.Name.Identifier.Text;

        // The receiver of the assertion must be Should()
        if (outerAccess.Expression is not InvocationExpressionSyntax shouldInvocation) return null;
        if (shouldInvocation.Expression is not MemberAccessExpressionSyntax shouldAccess) return null;
        if (shouldAccess.Name.Identifier.Text != "Should") return null;

        // Everything between the MemberBinding and .Should() is the member path
        var pathSegments = ExtractConditionalPathFromShouldTarget(shouldAccess.Expression);

        var target = new DslAssertionTarget
        {
            Kind    = pathSegments.Count > 0 ? "member" : "var",
            RootVar = rootVar,
            Path    = pathSegments.Count > 0 ? pathSegments : null,
            Name    = pathSegments.Count > 0 ? null : rootVar,
        };

        if (_registry.TryGetValue(assertionMethod, out var parser))
            return parser.Parse(outerInvocation, target);

        AddDiagnostic(
            DslDiagnosticCodes.UnsupportedAssertion,
            $"Unsupported assertion: '.Should().{assertionMethod}(...)'. Only Be, NotBeNull, ContainSingle, and Throw are supported.",
            section: "assert",
            hint: conditionalAssert.ToString());
        return null;
    }

    /// <summary>
    /// Extracts path segments from the expression that precedes .Should() inside a conditional access.
    /// e.g. for ?.ape_orderstatus.Should(), the input is the MemberBindingExpression (.ape_orderstatus).
    ///      for ?.ape_orderid.Id.Should(), the input is MemberAccess(.ape_orderid .Id => MemberBinding).
    ///      for ?.First().Record1Id.Id.Should(), includes "First" from the invocation.
    /// </summary>
    private static List<string> ExtractConditionalPathFromShouldTarget(ExpressionSyntax expr)
    {
        var parts = new List<string>();
        var current = expr;

        while (true)
        {
            if (current is MemberAccessExpressionSyntax ma)
            {
                parts.Insert(0, ma.Name.Identifier.Text);
                current = ma.Expression;
            }
            else if (current is InvocationExpressionSyntax inv && inv.ArgumentList.Arguments.Count == 0)
            {
                if (inv.Expression is MemberAccessExpressionSyntax invAccess)
                {
                    // Regular chain: .First() — record method name and continue
                    parts.Insert(0, invAccess.Name.Identifier.Text);
                    current = invAccess.Expression;
                }
                else if (inv.Expression is MemberBindingExpressionSyntax invBinding)
                {
                    // Start of conditional chain: ?.Count() — record method name, stop
                    parts.Insert(0, invBinding.Name.Identifier.Text);
                    break;
                }
                else
                {
                    break;
                }
            }
            else
            {
                break;
            }
        }

        if (current is MemberBindingExpressionSyntax binding)
            parts.Insert(0, binding.Name.Identifier.Text);

        return parts;
    }

    private DslAssertion? TryParseAssertion(ExpressionSyntax expr)
    {
        // Pattern: retrievedOrder?.ape_orderstatus.Should().Be(x)
        // The whole expression is a ConditionalAccessExpression — unwrap it by normalising
        // to a (rootVar, path-before-Should, outerInvocation) triple.
        if (expr is ConditionalAccessExpressionSyntax conditionalAssert)
            return TryParseConditionalAssertion(conditionalAssert);

        if (expr is not InvocationExpressionSyntax outerInvocation) return null;
        if (outerInvocation.Expression is not MemberAccessExpressionSyntax outerAccess) return null;

        var assertionMethod = outerAccess.Name.Identifier.Text;

        // Pattern: action.Should().Throw<T>().WithMessage("msg")
        // outerInvocation = WithMessage("msg"), outerAccess.Expression = Throw<T>() invocation
        if (assertionMethod == "WithMessage" &&
            outerAccess.Expression is InvocationExpressionSyntax throwInvocation &&
            throwInvocation.Expression is MemberAccessExpressionSyntax throwAccess &&
            throwAccess.Name is GenericNameSyntax throwGenericName &&
            throwGenericName.Identifier.Text == "Throw")
        {
            // Check that Throw chains from .Should()
            if (throwAccess.Expression is InvocationExpressionSyntax shouldInv2 &&
                shouldInv2.Expression is MemberAccessExpressionSyntax shouldAcc2 &&
                shouldAcc2.Name.Identifier.Text == "Should")
            {
                var target2 = ExtractAssertionTarget(shouldAcc2.Expression);
                var exType = throwGenericName.TypeArgumentList.Arguments.FirstOrDefault()?.ToString();
                string? withMsg = outerInvocation.ArgumentList.Arguments.Count > 0
                    ? outerInvocation.ArgumentList.Arguments[0].Expression
                        .ToString().Trim('"')
                    : null;
                // Strip surrounding quotes from string literal
                if (withMsg != null && outerInvocation.ArgumentList.Arguments[0].Expression
                    is Microsoft.CodeAnalysis.CSharp.Syntax.LiteralExpressionSyntax lit)
                    withMsg = lit.Token.ValueText;

                return new DslAssertion { Kind = "throw", Target = target2, ExceptionType = exType, WithMessage = withMsg };
            }
        }

        // Pattern: action.Should().Throw<T>()  (no WithMessage)
        if (outerAccess.Expression is not InvocationExpressionSyntax shouldInvocation) return null;
        if (shouldInvocation.Expression is not MemberAccessExpressionSyntax shouldAccess) return null;
        if (shouldAccess.Name.Identifier.Text != "Should") return null;

        var target = ExtractAssertionTarget(shouldAccess.Expression);

        // Handle Throw<T>() without chaining
        if (assertionMethod == "Throw" &&
            outerAccess.Name is GenericNameSyntax throwName)
        {
            var exType2 = throwName.TypeArgumentList.Arguments.FirstOrDefault()?.ToString();
            return new DslAssertion { Kind = "throw", Target = target, ExceptionType = exType2 };
        }

        if (_registry.TryGetValue(assertionMethod, out var parser))
            return parser.Parse(outerInvocation, target);

        AddDiagnostic(
            DslDiagnosticCodes.UnsupportedAssertion,
            $"Unsupported assertion: '.Should().{assertionMethod}(...)'. Only Be, NotBeNull, ContainSingle, and Throw are supported.",
            section: "assert",
            hint: expr.ToString());
        return null;
    }

    private static DslAssertionTarget ExtractAssertionTarget(ExpressionSyntax expr)
    {
        // Null-conditional: retrievedAccount?.Name  or  retrievedAccount?.Ref.Id
        if (expr is ConditionalAccessExpressionSyntax conditionalAccess)
        {
            var rootVar = conditionalAccess.Expression.ToString();
            var path = ExtractConditionalPath(conditionalAccess.WhenNotNull);
            if (path.Count > 0)
            {
                return new DslAssertionTarget
                {
                    Kind    = "member",
                    RootVar = rootVar,
                    Path    = path
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

    /// <summary>
    /// Walks the WhenNotNull portion of a ConditionalAccessExpression to collect path segments.
    /// Handles: ?.Name  (MemberBindingExpression)
    ///      and ?.Ref.Id  (MemberAccessExpression on MemberBindingExpression)
    ///      and ?.First().Name.Id  (InvocationExpression in the chain)
    /// </summary>
    private static List<string> ExtractConditionalPath(ExpressionSyntax whenNotNull)
    {
        var parts = new List<string>();
        var current = whenNotNull;

        while (true)
        {
            if (current is MemberAccessExpressionSyntax ma)
            {
                parts.Insert(0, ma.Name.Identifier.Text);
                current = ma.Expression;
            }
            else if (current is InvocationExpressionSyntax inv && inv.ArgumentList.Arguments.Count == 0)
            {
                if (inv.Expression is MemberAccessExpressionSyntax invAccess)
                {
                    // Regular chain: .First() — record method name and continue
                    parts.Insert(0, invAccess.Name.Identifier.Text);
                    current = invAccess.Expression;
                }
                else if (inv.Expression is MemberBindingExpressionSyntax invBinding)
                {
                    // Start of conditional chain: ?.Count() or ?.First() — record and stop
                    parts.Insert(0, invBinding.Name.Identifier.Text);
                    break;
                }
                else
                {
                    break;
                }
            }
            else
            {
                break;
            }
        }

        // The root of the chain should be a MemberBindingExpression (e.g. ?.ape_orderstatus)
        if (current is MemberBindingExpressionSyntax binding)
            parts.Insert(0, binding.Name.Identifier.Text);

        return parts;
    }
}
