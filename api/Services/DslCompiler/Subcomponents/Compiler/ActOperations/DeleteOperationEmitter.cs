using TestEngine.Models.Dsl;

namespace TestEngine.Services.DslCompiler;

internal sealed class DeleteOperationEmitter : DslSubcomponentBase, IActOperationEmitter
{
    private readonly ValueCompiler _values;

    public DeleteOperationEmitter(List<DslDiagnostic> diagnostics, ValueCompiler values)
        : base(diagnostics)
    {
        _values = values;
    }

    public string Kind => "delete";

    public string Emit(DslOperation op, string awaitPrefix)
    {
        var idArg = op.Id != null ? _values.CompileValue(op.Id) : "/* missing id */";
        var generic = op.GenericType != null ? $"<{op.GenericType}>" : "";
        var method = op.Awaited ? (op.UnawaitedVariant ? "DeleteUnawaitedAsync" : "DeleteAsync") : "Delete";
        return $"{awaitPrefix}AdminDao.{method}{generic}({idArg})";
    }
}
