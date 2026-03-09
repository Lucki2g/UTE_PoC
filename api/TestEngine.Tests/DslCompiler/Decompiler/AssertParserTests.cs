using Microsoft.CodeAnalysis.CSharp;
using Microsoft.CodeAnalysis.CSharp.Syntax;
using TestEngine.Models.Dsl;
using TestEngine.Services.DslCompiler;

namespace TestEngine.Tests.DslCompiler.Decompiler;

/// <summary>
/// Tests for AssertParser — the full assert-section parser that handles retrievals,
/// multiple assertions, conditional-access patterns, Throw chains, and multi-level paths.
/// </summary>
public class AssertParserTests
{
    private readonly List<DslDiagnostic> _diags = [];
    private readonly AssertParser _parser;

    public AssertParserTests()
    {
        var expr = new ExpressionDecompiler(_diags);
        _parser = new AssertParser(_diags, expr,
        [
            new NotNullAssertionParser(),
            new BeAssertionParser(expr),
            new ContainSingleAssertionParser(expr),
        ]);
    }

    private (List<DslRetrieval> retrievals, List<DslAssertion> assertions) Parse(string statementsCode)
    {
        var src  = $"class C {{ void M() {{ {statementsCode} }} }}";
        var tree = CSharpSyntaxTree.ParseText(src);
        var body = tree.GetRoot()
            .DescendantNodes()
            .OfType<MethodDeclarationSyntax>()
            .First()
            .Body!;
        return _parser.ParseAssertSection(body.Statements.ToList());
    }

    // ─── Retrievals ────────────────────────────────────────────────────────────

    [Fact]
    public void RetrieveFirstOrDefault_ParsedAsRetrieval()
    {
        var (retrievals, _) = Parse("""
            var order = AdminDao.RetrieveFirstOrDefault(xrm => xrm.ape_orderSet.Where(o => o.Id == orderId));
            """);

        Assert.Single(retrievals);
        Assert.Equal("retrieveFirstOrDefault", retrievals[0].Kind);
        Assert.Equal("order",         retrievals[0].Var);
        Assert.Equal("ape_orderSet",  retrievals[0].EntitySet);
        Assert.NotNull(retrievals[0].Where);
        Assert.Equal("eq", retrievals[0].Where!.Op);
    }

    [Fact]
    public void RetrieveList_WithoutWhere_ParsedAsRetrieval()
    {
        var (retrievals, _) = Parse("""
            var skills = AdminDao.RetrieveList(xrm => xrm.ape_skillSet);
            """);

        Assert.Single(retrievals);
        Assert.Equal("retrieveList", retrievals[0].Kind);
        Assert.Null(retrievals[0].Where);
    }

    // ─── Standard direct assertions ────────────────────────────────────────────

    [Fact]
    public void DirectVar_NotBeNull_Parsed()
    {
        var (_, assertions) = Parse("retrieved.Should().NotBeNull();");

        Assert.Single(assertions);
        Assert.Equal("notNull",   assertions[0].Kind);
        Assert.Equal("var",       assertions[0].Target.Kind);
        Assert.Equal("retrieved", assertions[0].Target.Name);
    }

    [Fact]
    public void DirectMember_Be_Parsed()
    {
        var (_, assertions) = Parse("retrieved.ape_name.Should().Be(\"C#\");");

        Assert.Single(assertions);
        Assert.Equal("be",        assertions[0].Kind);
        Assert.Equal("member",    assertions[0].Target.Kind);
        Assert.Equal("retrieved", assertions[0].Target.RootVar);
        Assert.Equal(["ape_name"], assertions[0].Target.Path);
        var sv = Assert.IsType<DslStringValue>(assertions[0].Expected);
        Assert.Equal("C#", sv.Value);
    }

    // ─── Multiple assertions ────────────────────────────────────────────────────

    [Fact]
    public void MultipleAssertions_AllParsed()
    {
        var (_, assertions) = Parse("""
            retrieved.Should().NotBeNull();
            retrieved?.ape_orderstatus.Should().Be(ape_orderstatus.Placed);
            retrieved?.ape_orderid.Id.Should().Be(order.Id);
            """);

        Assert.Equal(3, assertions.Count);
        Assert.Equal("notNull", assertions[0].Kind);
        Assert.Equal("be",      assertions[1].Kind);
        Assert.Equal("be",      assertions[2].Kind);
    }

    // ─── Conditional access: ?.prop.Should().Be() ─────────────────────────────

    [Fact]
    public void ConditionalAccess_SingleProp_Be_Parsed()
    {
        var (_, assertions) = Parse("retrieved?.ape_orderstatus.Should().Be(ape_orderstatus.Placed);");

        Assert.Single(assertions);
        var a = assertions[0];
        Assert.Equal("be",        a.Kind);
        Assert.Equal("member",    a.Target.Kind);
        Assert.Equal("retrieved", a.Target.RootVar);
        Assert.Equal(["ape_orderstatus"], a.Target.Path);
        // Expected is an enum value: ape_orderstatus.Placed
        var ev = Assert.IsType<DslEnumValue>(a.Expected);
        Assert.Equal("ape_orderstatus", ev.EnumType);
        Assert.Equal("Placed",          ev.Member);
    }

    [Fact]
    public void ConditionalAccess_SingleProp_NotBeNull_Parsed()
    {
        var (_, assertions) = Parse("retrieved?.ape_name.Should().NotBeNull();");

        Assert.Single(assertions);
        var a = assertions[0];
        Assert.Equal("notNull",   a.Kind);
        Assert.Equal("member",    a.Target.Kind);
        Assert.Equal("retrieved", a.Target.RootVar);
        Assert.Equal(["ape_name"], a.Target.Path);
    }

    // ─── Conditional access: multi-level ?.ref.Id.Should().Be() ───────────────

    [Fact]
    public void ConditionalAccess_TwoLevelPath_Be_Parsed()
    {
        var (_, assertions) = Parse("retrieved?.ape_orderid.Id.Should().Be(order.Id);");

        Assert.Single(assertions);
        var a = assertions[0];
        Assert.Equal("be",       a.Kind);
        Assert.Equal("member",   a.Target.Kind);
        Assert.Equal("retrieved", a.Target.RootVar);
        Assert.Equal(["ape_orderid", "Id"], a.Target.Path);
        var rv = Assert.IsType<DslRefValue>(a.Expected);
        Assert.Equal("order", rv.Ref.Id);
        Assert.Equal("Id",    rv.Ref.Member);
    }

    // ─── Throw chain ───────────────────────────────────────────────────────────

    [Fact]
    public void ThrowChain_NoMessage_Parsed()
    {
        var (_, assertions) = Parse("action.Should().Throw<InvalidPluginExecutionException>();");

        Assert.Single(assertions);
        var a = assertions[0];
        Assert.Equal("throw", a.Kind);
        Assert.Equal("var",   a.Target.Kind);
        Assert.Equal("action", a.Target.Name);
        Assert.Equal("InvalidPluginExecutionException", a.ExceptionType);
        Assert.Null(a.WithMessage);
    }

    [Fact]
    public void ThrowChain_WithMessage_Parsed()
    {
        var (_, assertions) = Parse(
            "action.Should().Throw<InvalidPluginExecutionException>().WithMessage(\"Order cannot be placed.\");");

        Assert.Single(assertions);
        var a = assertions[0];
        Assert.Equal("throw", a.Kind);
        Assert.Equal("InvalidPluginExecutionException", a.ExceptionType);
        Assert.Equal("Order cannot be placed.", a.WithMessage);
    }

    // ─── Mixed retrieval + multiple assertions ─────────────────────────────────

    [Fact]
    public void RetrievalAndMultipleAssertions_AllParsed()
    {
        var (retrievals, assertions) = Parse("""
            var retrieved = AdminDao.RetrieveFirstOrDefault(xrm => xrm.ape_orderSet);
            retrieved.Should().NotBeNull();
            retrieved?.ape_orderstatus.Should().Be(ape_orderstatus.Placed);
            """);

        Assert.Single(retrievals);
        Assert.Equal(2, assertions.Count);
        Assert.Equal("notNull", assertions[0].Kind);
        Assert.Equal("be",      assertions[1].Kind);
    }
}
