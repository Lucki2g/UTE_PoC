using Microsoft.CodeAnalysis.CSharp;
using Microsoft.CodeAnalysis.CSharp.Syntax;
using TestEngine.Models.Dsl;

namespace TestEngine.Services.DslCompiler;

internal sealed class ActParser : DslSubcomponentBase
{
    private readonly IReadOnlyDictionary<string, IActOperationParser> _registry;
    private readonly ExpressionDecompiler _expr;

    public ActParser(
        List<DslDiagnostic> diagnostics,
        IEnumerable<IActOperationParser> operations,
        ExpressionDecompiler? expr = null)
        : base(diagnostics)
    {
        _registry = operations.ToDictionary(o => o.NormalizedMethodName, StringComparer.Ordinal);
        _expr = expr ?? new ExpressionDecompiler(diagnostics);
    }

    public DslAct ParseActSection(List<StatementSyntax> statements)
    {
        var mutations = new List<DslActMutation>();

        foreach (var stmt in statements)
        {
            // var result = await AdminDao.CreateAsync<T>(entity.Entity);
            // OR: var action = () => AdminDao.Update(order);
            if (stmt is LocalDeclarationStatementSyntax localDecl)
            {
                var variable = localDecl.Declaration.Variables.FirstOrDefault();
                if (variable?.Initializer?.Value != null)
                {
                    var varName = variable.Identifier.Text;

                    // Delegate form: var action = () => AdminDao.Update(order);
                    var delegateAct = TryParseDelegateAct(varName, variable.Initializer.Value, mutations);
                    if (delegateAct != null) return delegateAct;

                    var (invokeExpr, awaited) = UnwrapAwait(variable.Initializer.Value);
                    if (invokeExpr != null)
                    {
                        var operation = ParseAdminDaoOperation(invokeExpr, awaited);
                        if (operation != null)
                        {
                            AttachMutations(operation, mutations);
                            return new DslAct { ResultVar = varName, Operation = operation };
                        }
                    }
                }
            }

            // await AdminDao.UpdateAsync<T>(entity.Entity);  (no result variable)
            if (stmt is ExpressionStatementSyntax exprStmt)
            {
                // Property assignment: order.ape_orderstatus = ape_orderstatus.Readyforpickup;
                if (exprStmt.Expression is AssignmentExpressionSyntax { RawKind: (int)SyntaxKind.SimpleAssignmentExpression } simpleAssign &&
                    simpleAssign.Left is MemberAccessExpressionSyntax memberLeft)
                {
                    var targetVar = memberLeft.Expression.ToString();
                    var path      = memberLeft.Name.Identifier.Text;
                    var value     = _expr.DecompileExpression(simpleAssign.Right);
                    mutations.Add(new DslActMutation { TargetVar = targetVar, Path = path, Value = value });
                    continue;
                }

                var (invokeExpr2, awaited2) = UnwrapAwait(exprStmt.Expression);
                if (invokeExpr2 != null)
                {
                    var operation = ParseAdminDaoOperation(invokeExpr2, awaited2);
                    if (operation != null)
                    {
                        AttachMutations(operation, mutations);
                        return new DslAct { ResultVar = null, Operation = operation };
                    }
                }
            }
        }

        return new DslAct { Operation = new DslOperation { Kind = "create", Awaited = false } };
    }

    private static void AttachMutations(DslOperation operation, List<DslActMutation> mutations)
    {
        if (mutations.Count > 0)
            operation.Mutations = [..mutations];
    }

    /// <summary>
    /// Detects: var action = () => AdminDao.Update(order);
    /// Returns a DslAct with DelegateVar set if matched.
    /// </summary>
    private DslAct? TryParseDelegateAct(string varName, ExpressionSyntax initExpr, List<DslActMutation> mutations)
    {
        ExpressionSyntax? lambdaBody = null;

        if (initExpr is SimpleLambdaExpressionSyntax simpleLambda)
            lambdaBody = simpleLambda.Body as ExpressionSyntax;
        else if (initExpr is ParenthesizedLambdaExpressionSyntax parenLambda)
            lambdaBody = parenLambda.Body as ExpressionSyntax;

        if (lambdaBody == null) return null;

        var (invokeExpr, awaited) = UnwrapAwait(lambdaBody);
        if (invokeExpr == null) return null;

        var operation = ParseAdminDaoOperation(invokeExpr, awaited);
        if (operation == null) return null;

        AttachMutations(operation, mutations);
        return new DslAct { DelegateVar = varName, Operation = operation };
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
