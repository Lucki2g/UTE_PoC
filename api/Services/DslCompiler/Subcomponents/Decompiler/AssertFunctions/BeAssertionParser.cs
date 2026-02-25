using Microsoft.CodeAnalysis.CSharp.Syntax;
using TestEngine.Models.Dsl;

namespace TestEngine.Services.DslCompiler;

internal sealed class BeAssertionParser : IAssertionFunctionParser
{
    private readonly ExpressionDecompiler _expr;

    public BeAssertionParser(ExpressionDecompiler expr)
    {
        _expr = expr;
    }

    public string MethodName => "Be";

    public DslAssertion? Parse(InvocationExpressionSyntax outerInvocation, DslAssertionTarget target)
    {
        if (outerInvocation.ArgumentList.Arguments.Count == 0) return null;

        return new DslAssertion
        {
            Kind     = "be",
            Target   = target,
            Expected = _expr.DecompileExpression(outerInvocation.ArgumentList.Arguments[0].Expression)
        };
    }
}
