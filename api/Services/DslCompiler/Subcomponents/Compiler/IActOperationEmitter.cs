using TestEngine.Models.Dsl;

namespace TestEngine.Services.DslCompiler;

internal interface IActOperationEmitter
{
    string Kind { get; }
    string Emit(DslOperation op, string awaitPrefix);
}
