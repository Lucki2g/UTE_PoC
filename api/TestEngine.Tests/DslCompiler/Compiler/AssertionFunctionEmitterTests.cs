using System.Text;
using TestEngine.Models.Dsl;
using TestEngine.Services.DslCompiler;

namespace TestEngine.Tests.DslCompiler.Compiler;

public class AssertionFunctionEmitterTests
{
    private readonly List<DslDiagnostic> _diags = [];
    private readonly ValueCompiler _values;

    public AssertionFunctionEmitterTests() => _values = new ValueCompiler(_diags);

    private static string Emit(IAssertionFunctionEmitter emitter, DslAssertion assertion, string target)
    {
        var sb = new StringBuilder();
        emitter.Emit(sb, assertion, target, "    ");
        return sb.ToString().Trim();
    }

    // ─── NotNull ───────────────────────────────────────────────────────────────

    [Fact]
    public void NotNull_EmitsShouldNotBeNull()
    {
        var emitter = new NotNullAssertionEmitter();
        var result  = Emit(emitter, new DslAssertion { Kind = "notNull", Target = new DslAssertionTarget { Kind = "var", Name = "x" } }, "x");
        Assert.Equal("x.Should().NotBeNull();", result);
    }

    // ─── Be ────────────────────────────────────────────────────────────────────

    [Fact]
    public void Be_WithExpected_EmitsShouldBe()
    {
        var emitter   = new BeAssertionEmitter(_values);
        var assertion = new DslAssertion
        {
            Kind     = "be",
            Target   = new DslAssertionTarget { Kind = "var", Name = "x" },
            Expected = new DslNumberValue { Value = 2.0 }
        };
        Assert.Equal("x.Should().Be(2);", Emit(emitter, assertion, "x"));
    }

    [Fact]
    public void Be_NullExpected_EmitsShouldBeNull()
    {
        var emitter   = new BeAssertionEmitter(_values);
        var assertion = new DslAssertion
        {
            Kind     = "be",
            Target   = new DslAssertionTarget { Kind = "var", Name = "x" },
            Expected = null
        };
        Assert.Equal("x.Should().Be(null);", Emit(emitter, assertion, "x"));
    }

    [Fact]
    public void Be_StringExpected_EmitsQuotedString()
    {
        var emitter   = new BeAssertionEmitter(_values);
        var assertion = new DslAssertion
        {
            Kind     = "be",
            Target   = new DslAssertionTarget { Kind = "var", Name = "x" },
            Expected = new DslStringValue { Value = "hello" }
        };
        Assert.Equal("x.Should().Be(\"hello\");", Emit(emitter, assertion, "x"));
    }

    // ─── ContainSingle ─────────────────────────────────────────────────────────

    [Fact]
    public void ContainSingle_WithPredicate_EmitsLambda()
    {
        var emitter   = new ContainSingleAssertionEmitter(_values);
        var assertion = new DslAssertion
        {
            Kind      = "containSingle",
            Target    = new DslAssertionTarget { Kind = "var", Name = "skills" },
            Predicate = new DslPredicate
            {
                Alias = "s",
                Op    = "eq",
                Left  = new DslPredicateLeft { Path = ["ape_name"] },
                Right = new DslStringValue { Value = "C#" }
            }
        };
        Assert.Equal("skills.Should().ContainSingle(s => s.ape_name == \"C#\");", Emit(emitter, assertion, "skills"));
    }

    [Fact]
    public void ContainSingle_WithoutPredicate_EmitsNoLambda()
    {
        var emitter   = new ContainSingleAssertionEmitter(_values);
        var assertion = new DslAssertion
        {
            Kind      = "containSingle",
            Target    = new DslAssertionTarget { Kind = "var", Name = "items" },
            Predicate = null
        };
        Assert.Equal("items.Should().ContainSingle();", Emit(emitter, assertion, "items"));
    }
}
