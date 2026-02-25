using Microsoft.CodeAnalysis.CSharp.Syntax;
using TestEngine.Models.Dsl;

namespace TestEngine.Services.DslCompiler;

internal interface IAssertionFunctionParser
{
    string MethodName { get; }
    DslAssertion? Parse(InvocationExpressionSyntax outerInvocation, DslAssertionTarget target);
}
