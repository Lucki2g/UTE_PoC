using System.Text;
using TestEngine.Models.Dsl;
using TestEngine.Services.DslCompiler;

namespace TestEngine.Services;

internal class DslToCSharpCompiler
{
    private readonly DslCompileOptions _options;
    private readonly List<DslDiagnostic> _diagnostics = [];

    private readonly ValueCompiler  _values;
    private readonly ArrangeEmitter _arrange;
    private readonly ActEmitter     _act;
    private readonly AssertEmitter  _assert;

    public DslToCSharpCompiler(DslCompileOptions options)
    {
        _options = options;
        _values  = new ValueCompiler(_diagnostics);
        _arrange = new ArrangeEmitter(_diagnostics, _values);
        _act     = new ActEmitter(_diagnostics, _values,
        [
            new CreateOperationEmitter(),
            new UpdateOperationEmitter(),
            new DeleteOperationEmitter(_diagnostics, _values),
            new AssociateOperationEmitter(_diagnostics, _values, "associate",    "Associate"),
            new AssociateOperationEmitter(_diagnostics, _values, "disassociate", "Disassociate"),
        ]);
        _assert  = new AssertEmitter(_diagnostics, _values,
        [
            new NotNullAssertionEmitter(),
            new BeAssertionEmitter(_values),
            new ContainSingleAssertionEmitter(_values),
        ]);
    }

    public DslCompileResult Compile(DslTestDefinition definition)
    {
        var test = definition.Test;
        var sb = new StringBuilder();

        if (_options.EmitClassShell) EmitClassHeader(sb, test);
        EmitMethodAttributes(sb, test);
        EmitMethodSignature(sb, test);
        EmitMethodBody(sb, test);
        if (_options.EmitClassShell) EmitClassFooter(sb);

        return new DslCompileResult { CSharpCode = sb.ToString(), Diagnostics = _diagnostics };
    }

    // --- Class / method shell ---

    private void EmitClassHeader(StringBuilder sb, DslTest test)
    {
        var ns        = _options.Namespace ?? "IntegrationTests";
        var className = _options.ClassName ?? ValueCompiler.DeriveClassName(test.Name);

        sb.AppendLine($"namespace {ns};");
        sb.AppendLine();

        if (test.Framework == "mstest")
            sb.AppendLine("[TestClass]");
        else if (test.Framework == "nunit")
            sb.AppendLine("[TestFixture]");

        sb.AppendLine($"public class {className} : {_options.BaseClass}");
        sb.AppendLine("{");
        sb.AppendLine($"    public {className}({_options.FixtureType} fixture)");
        sb.AppendLine("        : base(fixture)");
        sb.AppendLine("    {");
        sb.AppendLine("    }");
        sb.AppendLine();
    }

    private static void EmitClassFooter(StringBuilder sb) => sb.AppendLine("}");

    private void EmitMethodAttributes(StringBuilder sb, DslTest test)
    {
        var indent = _options.EmitClassShell ? "    " : "";

        if (test.Traits != null)
        {
            foreach (var (key, values) in test.Traits)
            {
                foreach (var value in values)
                {
                    switch (test.Framework)
                    {
                        case "xunit":
                            sb.AppendLine($"{indent}[Trait(\"{key}\", \"{value}\")]");
                            break;
                        case "mstest" when key.Equals("category", StringComparison.OrdinalIgnoreCase):
                            sb.AppendLine($"{indent}[TestCategory(\"{value}\")]");
                            break;
                        case "nunit" when key.Equals("category", StringComparison.OrdinalIgnoreCase):
                            sb.AppendLine($"{indent}[Category(\"{value}\")]");
                            break;
                    }
                }
            }
        }

        if (test.TimeoutMs.HasValue)
        {
            switch (test.Framework)
            {
                case "mstest":
                case "nunit":
                    sb.AppendLine($"{indent}[Timeout({test.TimeoutMs.Value})]");
                    break;
                case "xunit":
                    _diagnostics.Add(new DslDiagnostic
                    {
                        Code = DslDiagnosticCodes.UnsupportedTimeoutXunit,
                        Message = $"xUnit does not have a built-in [Timeout] attribute. Requested timeout: {test.TimeoutMs.Value}ms.",
                        Location = new DslDiagnosticLocation { Section = "test", Hint = $"timeoutMs: {test.TimeoutMs.Value}" }
                    });
                    break;
            }
        }

        if (test.Ignore != null && test.Framework != "xunit")
            sb.AppendLine($"{indent}[Ignore(\"{ValueCompiler.EscapeString(test.Ignore.Reason)}\")]");

        switch (test.Framework)
        {
            case "xunit":
                var attr = test.Kind == "theory" ? "Theory" : "Fact";
                if (test.Ignore != null)
                    sb.AppendLine($"{indent}[{attr}(Skip = \"{ValueCompiler.EscapeString(test.Ignore.Reason)}\")]");
                else
                    sb.AppendLine($"{indent}[{attr}]");
                break;
            case "mstest":
                sb.AppendLine($"{indent}[TestMethod]");
                break;
            case "nunit":
                sb.AppendLine($"{indent}[Test]");
                break;
        }
    }

    private void EmitMethodSignature(StringBuilder sb, DslTest test)
    {
        var indent     = _options.EmitClassShell ? "    " : "";
        var asyncMod   = test.Async ? "async " : "";
        var returnType = test.Async ? "Task" : "void";
        sb.AppendLine($"{indent}public {asyncMod}{returnType} {test.Name}()");
    }

    private void EmitMethodBody(StringBuilder sb, DslTest test)
    {
        var indent     = _options.EmitClassShell ? "    " : "";
        var bodyIndent = indent + "    ";

        sb.AppendLine($"{indent}{{");
        sb.AppendLine($"{bodyIndent}// Arrange");
        _arrange.Emit(sb, test.Arrange, bodyIndent);
        sb.AppendLine();
        sb.AppendLine($"{bodyIndent}// Act");
        _act.Emit(sb, test.Act, test, bodyIndent);
        sb.AppendLine();
        sb.AppendLine($"{bodyIndent}// Assert");
        _assert.Emit(sb, test.Assert, test, bodyIndent);
        sb.AppendLine($"{indent}}}");
    }
}
