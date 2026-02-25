using System.Text;
using TestEngine.Models.Dsl;

namespace TestEngine.Services.DslCompiler;

internal sealed class BeAssertionEmitter : IAssertionFunctionEmitter
{
    private readonly ValueCompiler _values;

    public BeAssertionEmitter(ValueCompiler values)
    {
        _values = values;
    }

    public string Kind => "be";

    public void Emit(StringBuilder sb, DslAssertion assertion, string compiledTarget, string indent)
    {
        var expected = assertion.Expected != null ? _values.CompileValue(assertion.Expected) : "null";
        sb.AppendLine($"{indent}{compiledTarget}.Should().Be({expected});");
    }
}
