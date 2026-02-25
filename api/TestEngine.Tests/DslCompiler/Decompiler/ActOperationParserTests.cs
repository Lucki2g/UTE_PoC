using Microsoft.CodeAnalysis;
using Microsoft.CodeAnalysis.CSharp;
using Microsoft.CodeAnalysis.CSharp.Syntax;
using TestEngine.Models.Dsl;
using TestEngine.Services.DslCompiler;

namespace TestEngine.Tests.DslCompiler.Decompiler;

public class ActOperationParserTests
{
    private readonly List<DslDiagnostic> _diags = [];
    private readonly ExpressionDecompiler _expr;

    public ActOperationParserTests() => _expr = new ExpressionDecompiler(_diags);

    private static SeparatedSyntaxList<ArgumentSyntax> ParseArgs(string callExpr)
    {
        var tree = CSharpSyntaxTree.ParseText($"var _ = {callExpr};");
        return tree.GetRoot()
            .DescendantNodes()
            .OfType<InvocationExpressionSyntax>()
            .First()
            .ArgumentList.Arguments;
    }

    // ─── CreateOperationParser ─────────────────────────────────────────────────

    [Fact]
    public void CreateParser_ReturnsCreateOperation()
    {
        var parser = new CreateOperationParser();
        var args   = ParseArgs("AdminDao.CreateAsync<Account>(account.Entity)");
        var result = parser.Parse(args, "Account", awaited: true, unawaitedVariant: false);

        Assert.Equal("create",  result.Kind);
        Assert.Equal("Account", result.GenericType);
        Assert.Equal("account", result.Entity?.FromBinding);
        Assert.Equal("Entity",  result.Entity?.Member);
        Assert.True(result.Awaited);
    }

    [Fact]
    public void CreateParser_UnawaitedVariant_SetsFlag()
    {
        var parser = new CreateOperationParser();
        var args   = ParseArgs("AdminDao.CreateUnawaitedAsync<Account>(account.Entity)");
        var result = parser.Parse(args, "Account", awaited: true, unawaitedVariant: true);

        Assert.Equal("create", result.Kind);
        Assert.True(result.UnawaitedVariant);
    }

    // ─── UpdateOperationParser ─────────────────────────────────────────────────

    [Fact]
    public void UpdateParser_ReturnsUpdateOperation()
    {
        var parser = new UpdateOperationParser();
        var args   = ParseArgs("AdminDao.UpdateAsync<Account>(account.Entity)");
        var result = parser.Parse(args, "Account", awaited: true, unawaitedVariant: false);

        Assert.Equal("update",  result.Kind);
        Assert.Equal("Account", result.GenericType);
        Assert.True(result.Awaited);
    }

    // ─── DeleteOperationParser ─────────────────────────────────────────────────

    [Fact]
    public void DeleteParser_ReturnsDeleteOperationWithId()
    {
        var parser = new DeleteOperationParser(_expr);
        var args   = ParseArgs("AdminDao.DeleteAsync<Account>(accountId)");
        var result = parser.Parse(args, "Account", awaited: true, unawaitedVariant: false);

        Assert.Equal("delete",  result.Kind);
        Assert.Equal("Account", result.GenericType);
        Assert.NotNull(result.Id);
    }

    // ─── RelationshipOperationParser ───────────────────────────────────────────

    [Fact]
    public void RelationshipParser_Associate_ReturnsAssociateOperation()
    {
        var parser = new RelationshipOperationParser(_expr, "AssociateEntities", "associate");
        var args   = ParseArgs("AdminDao.AssociateEntities(\"rel_name\", a.ToEntityReference(), b.ToEntityReference())");
        var result = parser.Parse(args, null, awaited: false, unawaitedVariant: false);

        Assert.Equal("associate", result.Kind);
        Assert.Equal("rel_name",  result.RelationshipName);
        Assert.NotNull(result.Target);
        Assert.NotNull(result.Related);
    }

    [Fact]
    public void RelationshipParser_Disassociate_ReturnsDisassociateOperation()
    {
        var parser = new RelationshipOperationParser(_expr, "DisassociateEntities", "disassociate");
        var args   = ParseArgs("AdminDao.DisassociateEntities(\"rel_name\", a.ToEntityReference(), b.ToEntityReference())");
        var result = parser.Parse(args, null, awaited: false, unawaitedVariant: false);

        Assert.Equal("disassociate", result.Kind);
    }
}
