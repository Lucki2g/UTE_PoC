using Microsoft.CodeAnalysis.CSharp.Syntax;
using TestEngine.Models.Dsl;

namespace TestEngine.Services.DslCompiler;

internal sealed class ActParser : DslSubcomponentBase
{
    private readonly IReadOnlyDictionary<string, IActOperationParser> _registry;

    public ActParser(
        List<DslDiagnostic> diagnostics,
        IEnumerable<IActOperationParser> operations)
        : base(diagnostics)
    {
        _registry = operations.ToDictionary(o => o.NormalizedMethodName, StringComparer.Ordinal);
    }

    public DslAct ParseActSection(List<StatementSyntax> statements)
    {
        foreach (var stmt in statements)
        {
            // var result = await AdminDao.CreateAsync<T>(entity.Entity);
            if (stmt is LocalDeclarationStatementSyntax localDecl)
            {
                var variable = localDecl.Declaration.Variables.FirstOrDefault();
                if (variable?.Initializer?.Value != null)
                {
                    var resultVar  = variable.Identifier.Text;
                    var (invokeExpr, awaited) = UnwrapAwait(variable.Initializer.Value);
                    if (invokeExpr != null)
                    {
                        var operation = ParseAdminDaoOperation(invokeExpr, awaited);
                        if (operation != null)
                            return new DslAct { ResultVar = resultVar, Operation = operation };
                    }
                }
            }

            // await AdminDao.UpdateAsync<T>(entity.Entity);  (no result variable)
            if (stmt is ExpressionStatementSyntax exprStmt)
            {
                var (invokeExpr, awaited) = UnwrapAwait(exprStmt.Expression);
                if (invokeExpr != null)
                {
                    var operation = ParseAdminDaoOperation(invokeExpr, awaited);
                    if (operation != null)
                        return new DslAct { ResultVar = null, Operation = operation };
                }
            }
        }

        return new DslAct { Operation = new DslOperation { Kind = "create", Awaited = false } };
    }

    private static (InvocationExpressionSyntax? invocation, bool awaited) UnwrapAwait(ExpressionSyntax expr)
    {
        if (expr is AwaitExpressionSyntax awaitExpr)
            return (awaitExpr.Expression as InvocationExpressionSyntax, true);
        return (expr as InvocationExpressionSyntax, false);
    }

    private DslOperation? ParseAdminDaoOperation(InvocationExpressionSyntax invocation, bool awaited)
    {
        if (invocation.Expression is not MemberAccessExpressionSyntax memberAccess) return null;

        var receiver = memberAccess.Expression.ToString();
        if (!receiver.Contains("AdminDao")) return null;

        var methodName   = memberAccess.Name.Identifier.Text;
        var genericType  = (memberAccess.Name as GenericNameSyntax)?
            .TypeArgumentList.Arguments.FirstOrDefault()?.ToString();
        var args             = invocation.ArgumentList.Arguments;
        var unawaitedVariant = methodName.Contains("Unawaited");

        var normalizedMethod = methodName
            .Replace("UnawaitedAsync", "")
            .Replace("Async", "");

        if (_registry.TryGetValue(normalizedMethod, out var parser))
            return parser.Parse(args, genericType, awaited, unawaitedVariant);

        return null;
    }
}
