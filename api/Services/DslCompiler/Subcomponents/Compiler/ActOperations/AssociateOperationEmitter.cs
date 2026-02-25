using TestEngine.Models.Dsl;

namespace TestEngine.Services.DslCompiler;

/// <summary>
/// Handles both "associate" and "disassociate" Act operations.
/// Register two instances — one per kind — in the orchestrator's constructor.
/// </summary>
internal sealed class AssociateOperationEmitter : DslSubcomponentBase, IActOperationEmitter
{
    private readonly ValueCompiler _values;
    private readonly string _verb;

    public AssociateOperationEmitter(
        List<DslDiagnostic> diagnostics,
        ValueCompiler values,
        string kind,
        string verb)
        : base(diagnostics)
    {
        _values = values;
        Kind = kind;
        _verb = verb;
    }

    public string Kind { get; }

    public string Emit(DslOperation op, string awaitPrefix)
    {
        var targetArg  = op.Target  != null ? _values.CompileValue(op.Target)         : "/* missing target */";
        var relatedArg = op.Related != null ? _values.CompileValue(op.Related.Value)  : "/* missing related */";
        var relName    = op.RelationshipName != null ? $"\"{op.RelationshipName}\"" : "/* missing relationship */";

        var methodBase = $"{_verb}Entities";
        var method = op.Awaited
            ? (op.UnawaitedVariant ? $"{methodBase}UnawaitedAsync" : $"{methodBase}Async")
            : methodBase;

        return $"{awaitPrefix}AdminDao.{method}({relName}, {targetArg}, {relatedArg})";
    }
}
