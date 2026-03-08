using Microsoft.CodeAnalysis.CSharp.Syntax;
using TestEngine.Models.Dsl;

namespace TestEngine.Services.DslCompiler;

/// <summary>
/// Parses: action.Should().Throw&lt;TException&gt;()
///     and: action.Should().Throw&lt;TException&gt;().WithMessage("msg")
/// </summary>
internal sealed class ThrowAssertionParser : IAssertionFunctionParser
{
    public string MethodName => "Throw";

    public DslAssertion? Parse(InvocationExpressionSyntax outerInvocation, DslAssertionTarget target)
    {
        // Extract the generic type argument (exception type)
        string? exceptionType = null;
        if (outerInvocation.Expression is MemberAccessExpressionSyntax throwAccess &&
            throwAccess.Name is GenericNameSyntax genericName)
        {
            exceptionType = genericName.TypeArgumentList.Arguments.FirstOrDefault()?.ToString();
        }

        // Check if there is a chained .WithMessage("...") call on the result
        // The pattern is: action.Should().Throw<T>().WithMessage("msg")
        // At this point outerInvocation IS the Throw<T>() call.
        // The WithMessage is handled one level up — but our parser receives only the Throw invocation.
        // We handle .WithMessage by inspecting parent context via the containing expression.
        // Since we cannot walk up easily here, WithMessage parsing is handled in AssertParser.

        return new DslAssertion
        {
            Kind          = "throw",
            Target        = target,
            ExceptionType = exceptionType
        };
    }
}
