using System.Text;
using TestEngine.Models.Dsl;

namespace TestEngine.Services.DslCompiler;

internal sealed class AssertEmitter : DslSubcomponentBase
{
    private readonly ValueCompiler _values;
    private readonly IReadOnlyDictionary<string, IAssertionFunctionEmitter> _registry;

    public AssertEmitter(
        List<DslDiagnostic> diagnostics,
        ValueCompiler values,
        IEnumerable<IAssertionFunctionEmitter> functions)
        : base(diagnostics)
    {
        _values = values;
        _registry = functions.ToDictionary(f => f.Kind, StringComparer.Ordinal);
    }

    public void Emit(StringBuilder sb, DslAssert assert, DslTest test, string indent)
    {
        var notNullVars = assert.Assertions
            .Where(a => a.Kind == "notNull" && a.Target.Kind == "var" && a.Target.Name != null)
            .Select(a => a.Target.Name!)
            .ToHashSet();

        foreach (var retrieval in assert.Retrievals)
            EmitRetrieval(sb, retrieval, test, indent);

        if (assert.Retrievals.Count > 0 && assert.Assertions.Count > 0)
            sb.AppendLine();

        foreach (var assertion in assert.Assertions)
        {
            var target = _values.CompileAssertionTarget(assertion.Target, notNullVars);

            if (_registry.TryGetValue(assertion.Kind, out var emitter))
            {
                emitter.Emit(sb, assertion, target, indent);
            }
            else
            {
                AddDiagnostic(
                    DslDiagnosticCodes.UnsupportedAssertion,
                    $"Unsupported assertion kind: '{assertion.Kind}'",
                    section: "assert");
                sb.AppendLine($"{indent}/* UNSUPPORTED ASSERTION: {assertion.Kind} */");
            }
        }
    }

    private void EmitRetrieval(StringBuilder sb, DslRetrieval retrieval, DslTest test, string indent)
    {
        var method = retrieval.Kind switch
        {
            "retrieveFirstOrDefault" => "RetrieveFirstOrDefault",
            "retrieveFirst"          => "RetrieveFirst",
            "retrieveSingle"         => "RetrieveSingle",
            "retrieveList"           => "RetrieveList",
            _                        => retrieval.Kind
        };

        var awaitPrefix = test.Async ? "await " : "";
        var asyncSuffix = test.Async ? "Async" : "";

        if (retrieval.Where != null)
        {
            var whereExpr = _values.CompileWhereExpression(retrieval.Where, retrieval.Alias);
            sb.AppendLine($"{indent}var {retrieval.Var} = {awaitPrefix}AdminDao.{method}{asyncSuffix}(");
            sb.AppendLine($"{indent}    xrm => xrm.{retrieval.EntitySet}.Where({retrieval.Alias} => {whereExpr}));");
        }
        else
        {
            sb.AppendLine($"{indent}var {retrieval.Var} = {awaitPrefix}AdminDao.{method}{asyncSuffix}(xrm => xrm.{retrieval.EntitySet});");
        }
    }
}
