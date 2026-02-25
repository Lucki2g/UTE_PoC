using TestEngine.Models.Dsl;

namespace TestEngine.Services.DslCompiler;

internal sealed class UpdateOperationEmitter : IActOperationEmitter
{
    public string Kind => "update";

    public string Emit(DslOperation op, string awaitPrefix)
    {
        var entityArg = ValueCompiler.CompileEntityRef(op.Entity);
        var generic = op.GenericType != null ? $"<{op.GenericType}>" : "";
        var method = op.Awaited ? (op.UnawaitedVariant ? "UpdateUnawaitedAsync" : "UpdateAsync") : "Update";
        return $"{awaitPrefix}AdminDao.{method}{generic}({entityArg})";
    }
}
