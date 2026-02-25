using System.Text;
using TestEngine.Models.Dsl;

namespace TestEngine.Services.DslCompiler;

internal sealed class ActEmitter : DslSubcomponentBase
{
    private readonly ValueCompiler _values;
    private readonly IReadOnlyDictionary<string, IActOperationEmitter> _registry;

    public ActEmitter(
        List<DslDiagnostic> diagnostics,
        ValueCompiler values,
        IEnumerable<IActOperationEmitter> operations)
        : base(diagnostics)
    {
        _values = values;
        _registry = operations.ToDictionary(o => o.Kind, StringComparer.Ordinal);
    }

    public void Emit(StringBuilder sb, DslAct act, DslTest test, string indent)
    {
        var op = act.Operation;
        var awaitPrefix = op.Awaited && test.Async ? "await " : "";

        _values.SetActResultVar(act.ResultVar);

        string call;
        if (_registry.TryGetValue(op.Kind, out var emitter))
        {
            call = emitter.Emit(op, awaitPrefix);
        }
        else
        {
            AddDiagnostic(
                DslDiagnosticCodes.UnknownOperationKind,
                $"Unknown operation kind: '{op.Kind}'",
                section: "act");
            call = $"/* UNKNOWN OPERATION: {op.Kind} */";
        }

        if (act.ResultVar != null)
            sb.AppendLine($"{indent}var {act.ResultVar} = {call};");
        else
            sb.AppendLine($"{indent}{call};");
    }
}
