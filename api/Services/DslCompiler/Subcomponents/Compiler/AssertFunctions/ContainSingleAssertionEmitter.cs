using System.Text;
using TestEngine.Models.Dsl;

namespace TestEngine.Services.DslCompiler;

internal sealed class ContainSingleAssertionEmitter : IAssertionFunctionEmitter
{
    private readonly ValueCompiler _values;

    public ContainSingleAssertionEmitter(ValueCompiler values)
    {
        _values = values;
    }

    public string Kind => "containSingle";

    public void Emit(StringBuilder sb, DslAssertion assertion, string compiledTarget, string indent)
    {
        if (assertion.Predicate != null)
        {
            var pred = _values.CompilePredicateExpression(assertion.Predicate);
            sb.AppendLine($"{indent}{compiledTarget}.Should().ContainSingle({pred});");
        }
        else
        {
            sb.AppendLine($"{indent}{compiledTarget}.Should().ContainSingle();");
        }
    }
}
