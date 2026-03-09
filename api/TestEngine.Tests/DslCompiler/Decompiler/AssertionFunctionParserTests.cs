using Microsoft.CodeAnalysis.CSharp;
using Microsoft.CodeAnalysis.CSharp.Syntax;
using TestEngine.Models.Dsl;
using TestEngine.Services.DslCompiler;

namespace TestEngine.Tests.DslCompiler.Decompiler;

public class AssertionFunctionParserTests
{
    private readonly List<DslDiagnostic> _diags = [];
    private readonly ExpressionDecompiler _expr;

    public AssertionFunctionParserTests() => _expr = new ExpressionDecompiler(_diags);

    private static (InvocationExpressionSyntax outer, DslAssertionTarget target) ParseAssertion(string assertionExpr)
    {
        var tree  = CSharpSyntaxTree.ParseText($"_ = {assertionExpr};");
        var outer = tree.GetRoot()
            .DescendantNodes()
            .OfType<InvocationExpressionSyntax>()
            .First();
        var target = new DslAssertionTarget { Kind = "var", Name = "x" };
        return (outer, target);
    }

    // ─── NotNullAssertionParser ────────────────────────────────────────────────

    [Fact]
    public void NotNullParser_ReturnsNotNullAssertion()
    {
        var parser = new NotNullAssertionParser();
        var (outer, target) = ParseAssertion("x.Should().NotBeNull()");
        var result = parser.Parse(outer, target);

        Assert.NotNull(result);
        Assert.Equal("notNull", result!.Kind);
        Assert.Same(target, result.Target);
    }

    // ─── BeAssertionParser ────────────────────────────────────────────────────

    [Fact]
    public void BeParser_WithStringArg_ReturnsBe_WithStringExpected()
    {
        var parser = new BeAssertionParser(_expr);
        var (outer, target) = ParseAssertion("x.Should().Be(\"hello\")");
        var result = parser.Parse(outer, target);

        Assert.NotNull(result);
        Assert.Equal("be", result!.Kind);
        var sv = Assert.IsType<DslStringValue>(result.Expected);
        Assert.Equal("hello", sv.Value);
    }

    [Fact]
    public void BeParser_NoArgs_ReturnsNull()
    {
        var parser = new BeAssertionParser(_expr);
        var (outer, target) = ParseAssertion("x.Should().Be()");
        var result = parser.Parse(outer, target);

        Assert.Null(result);
    }

    // ─── ContainSingleAssertionParser ─────────────────────────────────────────

    [Fact]
    public void ContainSingleParser_WithEqPredicate_ReturnsPredicateAssertion()
    {
        var parser = new ContainSingleAssertionParser(_expr);
        var (outer, target) = ParseAssertion("items.Should().ContainSingle(x => x.Name == \"John\")");
        var result = parser.Parse(outer, target);

        Assert.NotNull(result);
        Assert.Equal("containSingle", result!.Kind);
        Assert.NotNull(result.Predicate);
        Assert.Equal("eq", result.Predicate!.Op);
        Assert.Equal("x",  result.Predicate.Alias);
        var sv = Assert.IsType<DslStringValue>(result.Predicate.Right);
        Assert.Equal("John", sv.Value);
    }

    [Fact]
    public void ContainSingleParser_WithoutArgs_ReturnsAssertionWithoutPredicate()
    {
        var parser = new ContainSingleAssertionParser(_expr);
        var (outer, target) = ParseAssertion("items.Should().ContainSingle()");
        var result = parser.Parse(outer, target);

        Assert.NotNull(result);
        Assert.Equal("containSingle", result!.Kind);
        Assert.Null(result.Predicate);
    }

    // ─── BeAssertionParser — typed expected values ────────────────────────────

    [Fact]
    public void BeParser_WithEnumArg_ReturnsEnumValue()
    {
        var parser = new BeAssertionParser(_expr);
        var (outer, target) = ParseAssertion("x.Should().Be(ape_orderstatus.Placed)");
        var result = parser.Parse(outer, target);

        Assert.NotNull(result);
        var ev = Assert.IsType<DslEnumValue>(result!.Expected);
        Assert.Equal("ape_orderstatus", ev.EnumType);
        Assert.Equal("Placed",          ev.Member);
    }

    [Fact]
    public void BeParser_WithRefMemberArg_ReturnsRefValue()
    {
        var parser = new BeAssertionParser(_expr);
        var (outer, target) = ParseAssertion("x.Should().Be(order.Id)");
        var result = parser.Parse(outer, target);

        Assert.NotNull(result);
        var rv = Assert.IsType<DslRefValue>(result!.Expected);
        Assert.Equal("order", rv.Ref.Id);
        Assert.Equal("Id",    rv.Ref.Member);
    }
}
