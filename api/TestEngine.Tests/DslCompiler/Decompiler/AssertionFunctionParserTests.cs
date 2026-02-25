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
}
