using Microsoft.CodeAnalysis.CSharp;
using Microsoft.CodeAnalysis.CSharp.Syntax;
using TestEngine.Models.Dsl;
using TestEngine.Services.DslCompiler;

namespace TestEngine.Tests.DslCompiler.Decompiler;

/// <summary>
/// Tests for ActParser — the full act-section parser covering property mutations,
/// delegate act wrapping, and standard operation parsing.
/// </summary>
public class ActParserTests
{
    private readonly List<DslDiagnostic> _diags = [];
    private readonly ActParser _parser;

    public ActParserTests()
    {
        var expr = new ExpressionDecompiler(_diags);
        _parser = new ActParser(_diags,
        [
            new CreateOperationParser(),
            new UpdateOperationParser(),
            new DeleteOperationParser(expr),
            new RelationshipOperationParser(expr, "AssociateEntities",    "associate"),
            new RelationshipOperationParser(expr, "DisassociateEntities", "disassociate"),
        ], expr);
    }

    private DslAct Parse(string statementsCode)
    {
        var src  = $"class C {{ void M() {{ {statementsCode} }} }}";
        var tree = CSharpSyntaxTree.ParseText(src);
        var body = tree.GetRoot()
            .DescendantNodes()
            .OfType<MethodDeclarationSyntax>()
            .First()
            .Body!;
        return _parser.ParseActSection(body.Statements.ToList());
    }

    // ─── Standard operations ───────────────────────────────────────────────────

    [Fact]
    public void SyncUpdate_ParsesOperation()
    {
        var act = Parse("AdminDao.Update(order.Entity);");

        Assert.Equal("update", act.Operation.Kind);
        Assert.Equal("order",  act.Operation.Entity?.FromBinding);
        Assert.Null(act.ResultVar);
        Assert.Null(act.DelegateVar);
    }

    [Fact]
    public void SyncCreate_WithResultVar_ParsesOperation()
    {
        var act = Parse("var result = AdminDao.Create(entity.Entity);");

        Assert.Equal("create", act.Operation.Kind);
        Assert.Equal("result", act.ResultVar);
    }

    // ─── Property mutations before operation ──────────────────────────────────

    [Fact]
    public void SinglePropertyAssignment_BeforeUpdate_ParsedAsMutation()
    {
        var act = Parse("""
            order.ape_orderstatus = ape_orderstatus.Placed;
            AdminDao.Update(order.Entity);
            """);

        Assert.Equal("update", act.Operation.Kind);
        Assert.NotNull(act.Operation.Mutations);
        Assert.Single(act.Operation.Mutations!);

        var m = act.Operation.Mutations![0];
        Assert.Equal("order",            m.TargetVar);
        Assert.Equal("ape_orderstatus",  m.Path);
        var ev = Assert.IsType<DslEnumValue>(m.Value);
        Assert.Equal("ape_orderstatus", ev.EnumType);
        Assert.Equal("Placed",          ev.Member);
    }

    [Fact]
    public void MultiplePropertyAssignments_BeforeUpdate_AllParsedAsMutations()
    {
        var act = Parse("""
            order.ape_orderstatus = ape_orderstatus.Placed;
            order.ape_name = "Updated";
            AdminDao.Update(order.Entity);
            """);

        Assert.Equal(2, act.Operation.Mutations!.Count);
        Assert.Equal("ape_orderstatus", act.Operation.Mutations![0].Path);
        Assert.Equal("ape_name",        act.Operation.Mutations![1].Path);
    }

    [Fact]
    public void NoPropertyAssignments_MutationsIsNull()
    {
        var act = Parse("AdminDao.Update(order.Entity);");

        Assert.Null(act.Operation.Mutations);
    }

    // ─── Delegate act wrapping ─────────────────────────────────────────────────

    [Fact]
    public void DelegateAct_ParsesDelegateVar()
    {
        var act = Parse("var action = () => AdminDao.Update(order.Entity);");

        Assert.Equal("action", act.DelegateVar);
        Assert.Equal("update", act.Operation.Kind);
        Assert.Null(act.ResultVar);
    }

    [Fact]
    public void DelegateAct_WithPropertyMutation_MutationsAttached()
    {
        var act = Parse("""
            order.ape_orderstatus = ape_orderstatus.Placed;
            var action = () => AdminDao.Update(order.Entity);
            """);

        Assert.Equal("action", act.DelegateVar);
        Assert.NotNull(act.Operation.Mutations);
        Assert.Single(act.Operation.Mutations!);
        Assert.Equal("ape_orderstatus", act.Operation.Mutations![0].Path);
    }
}
