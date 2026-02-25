using Microsoft.CodeAnalysis.CSharp.Syntax;
using TestEngine.Models.Dsl;

namespace TestEngine.Services.DslCompiler;

internal sealed class ArrangeParser : DslSubcomponentBase
{
    private readonly ExpressionDecompiler _expr;
    private readonly IReadOnlyDictionary<string, string> _producerEntityMap;

    public ArrangeParser(
        List<DslDiagnostic> diagnostics,
        ExpressionDecompiler expr,
        IReadOnlyDictionary<string, string> producerEntityMap)
        : base(diagnostics)
    {
        _expr = expr;
        _producerEntityMap = producerEntityMap;
    }

    public List<DslBinding> ParseArrangeBindings(List<StatementSyntax> statements)
    {
        var bindings = new List<DslBinding>();
        var anonymousIndex = 0;

        foreach (var stmt in statements)
        {
            if (stmt is LocalDeclarationStatementSyntax localDecl)
            {
                var variable = localDecl.Declaration.Variables.FirstOrDefault();
                if (variable?.Initializer?.Value == null) continue;

                var binding = TryParseProducerBinding(variable.Identifier.Text, variable.Initializer.Value);
                if (binding != null)
                    bindings.Add(binding);
            }
            else if (stmt is ExpressionStatementSyntax exprStmt)
            {
                var syntheticId = $"_anon{anonymousIndex}";
                var binding = TryParseProducerBinding(syntheticId, exprStmt.Expression);
                if (binding != null)
                {
                    anonymousIndex++;
                    bindings.Add(binding);
                }
            }
        }

        return bindings;
    }

    private DslBinding? TryParseProducerBinding(string varName, ExpressionSyntax expr)
    {
        var withMutations = new List<DslWithMutation>();
        var hasBuild = false;
        string? producerCall = null;

        var current = expr;

        while (current is InvocationExpressionSyntax invocation)
        {
            if (invocation.Expression is MemberAccessExpressionSyntax memberAccess)
            {
                var methodName = memberAccess.Name.Identifier.Text;

                if (methodName == "Build")
                {
                    hasBuild = true;
                    current = memberAccess.Expression;
                    continue;
                }

                if (methodName == "With" && invocation.ArgumentList.Arguments.Count > 0)
                {
                    var mutation = TryParseWithMutation(invocation.ArgumentList.Arguments[0]);
                    if (mutation != null)
                        withMutations.Insert(0, mutation);
                    current = memberAccess.Expression;
                    continue;
                }

                var fullCall = invocation.Expression.ToString();
                if (fullCall.Contains("Producer.") || fullCall.StartsWith("Producer.", StringComparison.Ordinal))
                {
                    producerCall = fullCall;
                    break;
                }

                current = memberAccess.Expression;
            }
            else
            {
                var callText = invocation.Expression.ToString();
                if (callText.Contains("Producer."))
                    producerCall = callText;
                break;
            }
        }

        if (producerCall == null) return null;

        var callParts = producerCall.Split('.');
        var draftMethod = callParts.Length > 1 ? callParts[^1] : producerCall;
        var entityType  = _producerEntityMap.TryGetValue(draftMethod, out var mapped) ? mapped : "Unknown";
        var normalizedCall = $"DataProducer.{entityType}.{draftMethod}";

        return new DslBinding
        {
            Id       = varName,
            Var      = varName,
            Kind     = "producerDraft",
            Producer = new DslProducerCall { Call = normalizedCall, With = withMutations },
            Build    = hasBuild
        };
    }

    private DslWithMutation? TryParseWithMutation(ArgumentSyntax argument)
    {
        ExpressionSyntax? lambdaBody = null;

        if (argument.Expression is SimpleLambdaExpressionSyntax simpleLambda)
        {
            lambdaBody = simpleLambda.Body as ExpressionSyntax;
            if (lambdaBody == null && simpleLambda.Body is BlockSyntax simpleBlock)
                lambdaBody = simpleBlock.Statements.FirstOrDefault() is ExpressionStatementSyntax es
                    ? es.Expression : null;
        }
        else if (argument.Expression is ParenthesizedLambdaExpressionSyntax parenLambda)
        {
            lambdaBody = parenLambda.Body as ExpressionSyntax;
            if (lambdaBody == null && parenLambda.Body is BlockSyntax parenBlock)
                lambdaBody = parenBlock.Statements.FirstOrDefault() is ExpressionStatementSyntax es2
                    ? es2.Expression : null;
        }

        if (lambdaBody is not AssignmentExpressionSyntax assignment) return null;

        var path = ExtractPropertyPath(assignment.Left);
        if (path == null) return null;

        var value = _expr.DecompileExpression(assignment.Right);
        return new DslWithMutation { Path = path, Value = value };
    }

    private static string? ExtractPropertyPath(ExpressionSyntax expr)
    {
        if (expr is MemberAccessExpressionSyntax memberAccess)
            return memberAccess.Name.Identifier.Text;
        return null;
    }
}
