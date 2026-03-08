using System.Text;
using TestEngine.Models.Dsl;

namespace TestEngine.Services.DslCompiler;

internal sealed class ThrowAssertionEmitter : IAssertionFunctionEmitter
{
    public string Kind => "throw";

    public void Emit(StringBuilder sb, DslAssertion assertion, string compiledTarget, string indent)
    {
        var exType = assertion.ExceptionType ?? "Exception";

        if (!string.IsNullOrEmpty(assertion.WithMessage))
        {
            var escaped = ValueCompiler.EscapeString(assertion.WithMessage);
            sb.AppendLine($"{indent}{compiledTarget}.Should().Throw<{exType}>().WithMessage(\"{escaped}\");");
        }
        else
        {
            sb.AppendLine($"{indent}{compiledTarget}.Should().Throw<{exType}>();");
        }
    }
}
