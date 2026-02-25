using System.Text;
using TestEngine.Models.Dsl;
using TestEngine.Services.DslCompiler;

namespace TestEngine.Tests.DslCompiler.Compiler;

/// <summary>
/// Verifies that ActEmitter and AssertEmitter correctly handle unknown kinds
/// via their registry-based dispatch: adds a diagnostic and emits a fallback comment.
/// </summary>
public class RegistryDispatchTests
{
    private readonly List<DslDiagnostic> _diags = [];
    private readonly ValueCompiler _values;

    public RegistryDispatchTests() => _values = new ValueCompiler(_diags);

    private static DslTest MakeTestShell() => new()
    {
        Framework = "xunit",
        Name      = "T",
        Arrange   = new DslArrange(),
        Act       = new DslAct { Operation = new DslOperation { Kind = "create" } },
        Assert    = new DslAssert()
    };

    [Fact]
    public void ActEmitter_UnknownKind_AddsDiagnosticAndEmitsFallback()
    {
        var emitter = new ActEmitter(_diags, _values, [new CreateOperationEmitter()]);
        var sb      = new StringBuilder();
        var act     = new DslAct { Operation = new DslOperation { Kind = "explode" } };

        emitter.Emit(sb, act, MakeTestShell(), "    ");

        Assert.Single(_diags);
        Assert.Contains("explode", _diags[0].Message);
        Assert.Contains("UNKNOWN OPERATION", sb.ToString());
    }

    [Fact]
    public void AssertEmitter_UnknownKind_AddsDiagnosticAndEmitsFallback()
    {
        var emitter = new AssertEmitter(_diags, _values, [new NotNullAssertionEmitter()]);
        var sb      = new StringBuilder();
        var assert  = new DslAssert
        {
            Assertions =
            [
                new DslAssertion { Kind = "haveCount", Target = new DslAssertionTarget { Kind = "var", Name = "x" } }
            ]
        };

        emitter.Emit(sb, assert, MakeTestShell(), "    ");

        Assert.Single(_diags);
        Assert.Contains("haveCount", _diags[0].Message);
        Assert.Contains("UNSUPPORTED ASSERTION", sb.ToString());
    }
}
