using TestEngine.Models.Dsl;

namespace TestEngine.Services.DslCompiler;

internal sealed class CreateOperationEmitter : IActOperationEmitter
{
    public string Kind => "create";

    public string Emit(DslOperation op, string awaitPrefix)
    {
        var entityArg = ValueCompiler.CompileEntityRef(op.Entity);
        var generic = op.GenericType != null ? $"<{op.GenericType}>" : "";
        var method = op.Awaited ? (op.UnawaitedVariant ? "CreateUnawaitedAsync" : "CreateAsync") : "Create";
        return $"{awaitPrefix}AdminDao.{method}{generic}({entityArg})";
    }
}
