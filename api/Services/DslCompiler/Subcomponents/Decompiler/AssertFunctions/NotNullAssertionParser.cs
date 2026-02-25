using Microsoft.CodeAnalysis.CSharp.Syntax;
using TestEngine.Models.Dsl;

namespace TestEngine.Services.DslCompiler;

internal sealed class NotNullAssertionParser : IAssertionFunctionParser
{
    public string MethodName => "NotBeNull";

    public DslAssertion? Parse(InvocationExpressionSyntax outerInvocation, DslAssertionTarget target)
    {
        return new DslAssertion { Kind = "notNull", Target = target };
    }
}
