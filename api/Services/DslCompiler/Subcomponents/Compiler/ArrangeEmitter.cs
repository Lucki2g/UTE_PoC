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
        var hasMaterialize = binding.Materialize;
        var hasInactivate = binding.Inactivate;
        var isAnonymous = binding.Id.StartsWith("_anon", StringComparison.Ordinal);

        if (isAnonymous)
        {
            sb.Append($"{indent}{producerCall}()");
        }
        else if (!hasWith && !hasBuild && !hasMaterialize && !hasInactivate)
        {
            sb.AppendLine($"{indent}var {binding.Var} = {producerCall}();");
            return;
        }
        else
        {
            sb.Append($"{indent}var {binding.Var} = {producerCall}()");
        }

        var lambdaParam = ValueCompiler.DeriveLambdaParam(producerCall);

        // Extract entity identifier from call "DataProducer.EntityName.DraftMethod" for property resolution
        var callParts = binding.Producer.Call.Split('.');
        var entityIdentifier = callParts.Length >= 2 ? callParts[1] : null;

        foreach (var mutation in binding.Producer.With)
        {
            var value = _values.CompileValue(mutation.Value);
            var resolvedPath = entityIdentifier != null
                ? _values.ResolveEntityProperty(entityIdentifier, mutation.Path)
                : mutation.Path;
            sb.AppendLine();
            sb.Append($"{indent}    .With({lambdaParam} => {lambdaParam}.{resolvedPath} = {value})");
        }

        if (hasInactivate)
        {
            sb.AppendLine();
            sb.Append($"{indent}    .WithInactivation()");
        }

        if (hasMaterialize)
        {
            sb.AppendLine();
            sb.Append($"{indent}    .Materialize()");
        }

        if (hasBuild)
        {
            sb.AppendLine();
            sb.Append($"{indent}    .Build()");
        }

        sb.AppendLine(";");
    }
}
