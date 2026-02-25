using Microsoft.CodeAnalysis;
using Microsoft.CodeAnalysis.CSharp;
using Microsoft.CodeAnalysis.CSharp.Syntax;
using TestEngine.Models.Dsl;

namespace TestEngine.Services.DslCompiler;

internal sealed class ContainSingleAssertionParser : IAssertionFunctionParser
{
    private readonly ExpressionDecompiler _expr;

    public ContainSingleAssertionParser(ExpressionDecompiler expr)
    {
        _expr = expr;
    }

    public string MethodName => "ContainSingle";

    public DslAssertion? Parse(InvocationExpressionSyntax outerInvocation, DslAssertionTarget target)
    {
        if (outerInvocation.ArgumentList.Arguments.Count == 0)
            return new DslAssertion { Kind = "containSingle", Target = target };

        var predicate = ParseContainSinglePredicate(outerInvocation.ArgumentList.Arguments[0]);
        return new DslAssertion { Kind = "containSingle", Target = target, Predicate = predicate };
    }

    private DslPredicate? ParseContainSinglePredicate(ArgumentSyntax argument)
    {
        ExpressionSyntax? body = null;
        string? alias = null;

        if (argument.Expression is SimpleLambdaExpressionSyntax simpleLambda)
        {
            alias = simpleLambda.Parameter.Identifier.Text;
            body  = simpleLambda.Body as ExpressionSyntax;
        }
        else if (argument.Expression is ParenthesizedLambdaExpressionSyntax parenLambda)
        {
            alias = parenLambda.ParameterList.Parameters.FirstOrDefault()?.Identifier.Text;
            body  = parenLambda.Body as ExpressionSyntax;
        }

        if (body is not BinaryExpressionSyntax binary) return null;
        if (!binary.IsKind(SyntaxKind.EqualsExpression)) return null;

        var path = new List<string>();
        var leftExpr = binary.Left;
        while (leftExpr is MemberAccessExpressionSyntax ma)
        {
            path.Insert(0, ma.Name.Identifier.Text);
            leftExpr = ma.Expression;
        }

        var right = _expr.DecompileExpression(binary.Right);

        return new DslPredicate
        {
            Alias = alias ?? "x",
            Op    = "eq",
            Left  = new DslPredicateLeft { Path = path },
            Right = right
        };
    }
}
