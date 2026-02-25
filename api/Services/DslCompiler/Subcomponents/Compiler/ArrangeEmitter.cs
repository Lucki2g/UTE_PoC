using System.Text;
using TestEngine.Models.Dsl;

namespace TestEngine.Services.DslCompiler;

internal sealed class ArrangeEmitter : DslSubcomponentBase
{
    private readonly ValueCompiler _values;

    public ArrangeEmitter(List<DslDiagnostic> diagnostics, ValueCompiler values)
        : base(diagnostics)
    {
        _values = values;
    }

    public void Emit(StringBuilder sb, DslArrange arrange, string indent)
    {
        foreach (var binding in arrange.Bindings)
            EmitBinding(sb, binding, indent);
    }

    private void EmitBinding(StringBuilder sb, DslBinding binding, string indent)
    {
        var producerCall = ValueCompiler.ToCSharpProducerCall(binding.Producer.Call);
        var hasWith = binding.Producer.With.Count > 0;
        var hasBuild = binding.Build;
        var isAnonymous = binding.Id.StartsWith("_anon", StringComparison.Ordinal);

        if (isAnonymous)
        {
            sb.Append($"{indent}{producerCall}()");
        }
        else if (!hasWith && !hasBuild)
        {
            sb.AppendLine($"{indent}var {binding.Var} = {producerCall}();");
            return;
        }
        else
        {
            sb.Append($"{indent}var {binding.Var} = {producerCall}()");
        }

        var lambdaParam = ValueCompiler.DeriveLambdaParam(producerCall);

        foreach (var mutation in binding.Producer.With)
        {
            var value = _values.CompileValue(mutation.Value);
            sb.AppendLine();
            sb.Append($"{indent}    .With({lambdaParam} => {lambdaParam}.{mutation.Path} = {value})");
        }

        if (hasBuild)
        {
            sb.AppendLine();
            sb.Append($"{indent}    .Build()");
        }

        sb.AppendLine(";");
    }
}
