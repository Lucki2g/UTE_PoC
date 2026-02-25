using System.Text;
using TestEngine.Models.Dsl;

namespace TestEngine.Services.DslCompiler;

internal interface IAssertionFunctionEmitter
{
    string Kind { get; }
    void Emit(StringBuilder sb, DslAssertion assertion, string compiledTarget, string indent);
}
