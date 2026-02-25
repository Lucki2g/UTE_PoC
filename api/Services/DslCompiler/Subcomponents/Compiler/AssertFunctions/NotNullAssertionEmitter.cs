using System.Text;
using TestEngine.Models.Dsl;

namespace TestEngine.Services.DslCompiler;

internal sealed class NotNullAssertionEmitter : IAssertionFunctionEmitter
{
    public string Kind => "notNull";

    public void Emit(StringBuilder sb, DslAssertion assertion, string compiledTarget, string indent)
    {
        sb.AppendLine($"{indent}{compiledTarget}.Should().NotBeNull();");
    }
}
