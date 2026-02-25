using Microsoft.CodeAnalysis.CSharp;
using Microsoft.CodeAnalysis.CSharp.Syntax;
using TestEngine.Models.Dsl;
using TestEngine.Services.DslCompiler;

namespace TestEngine.Tests.DslCompiler.Decompiler;

public class ExpressionDecompilerTests
{
    private readonly List<DslDiagnostic> _diags = [];
    private readonly ExpressionDecompiler _sut;

    public ExpressionDecompilerTests() => _sut = new ExpressionDecompiler(_diags);

    private static ExpressionSyntax Parse(string expr)
    {
        var tree = CSharpSyntaxTree.ParseText($"var _ = {expr};");
        return tree.GetRoot()
            .DescendantNodes()
            .OfType<LocalDeclarationStatementSyntax>()
            .First()
            .Declaration.Variables[0]
            .Initializer!.Value;
    }

    // ─── Literals ──────────────────────────────────────────────────────────────

    [Fact]
    public void StringLiteral_ReturnsStringValue()
    {
        var result = _sut.DecompileExpression(Parse("\"hello\""));
        var sv = Assert.IsType<DslStringValue>(result);
        Assert.Equal("hello", sv.Value);
    }

    [Fact]
    public void IntegerLiteral_ReturnsNumberValue()
    {
        var result = _sut.DecompileExpression(Parse("42"));
        var nv = Assert.IsType<DslNumberValue>(result);
        Assert.Equal(42.0, nv.Value);
    }

    [Fact]
    public void TrueLiteral_ReturnsBooleanTrue()
    {
        var result = _sut.DecompileExpression(Parse("true"));
        var bv = Assert.IsType<DslBooleanValue>(result);
        Assert.True(bv.Value);
    }

    [Fact]
    public void FalseLiteral_ReturnsBooleanFalse()
    {
        var result = _sut.DecompileExpression(Parse("false"));
        var bv = Assert.IsType<DslBooleanValue>(result);
        Assert.False(bv.Value);
    }

    [Fact]
    public void NullLiteral_ReturnsDslNullValue()
    {
        Assert.IsType<DslNullValue>(_sut.DecompileExpression(Parse("null")));
    }

    // ─── Guid / enum ──────────────────────────────────────────────────────────

    [Fact]
    public void NewGuid_ReturnsGuidValue()
    {
        var result = _sut.DecompileExpression(Parse("new Guid(\"aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee\")"));
        var gv = Assert.IsType<DslGuidValue>(result);
        Assert.Equal("aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee", gv.Value);
    }

    [Fact]
    public void CastToEnum_ReturnsEnumNumberValue()
    {
        var result = _sut.DecompileExpression(Parse("(MyEnum)5"));
        var env = Assert.IsType<DslEnumNumberValue>(result);
        Assert.Equal("MyEnum", env.EnumType);
        Assert.Equal(5, env.Value);
    }

    [Fact]
    public void PascalCaseWithUnderscore_ReturnsEnumValue()
    {
        var result = _sut.DecompileExpression(Parse("Account_Status.Active"));
        var ev = Assert.IsType<DslEnumValue>(result);
        Assert.Equal("Account_Status", ev.EnumType);
        Assert.Equal("Active", ev.Member);
    }

    // ─── References ───────────────────────────────────────────────────────────

    [Fact]
    public void LowercaseMemberAccess_ReturnsRefValue()
    {
        var result = _sut.DecompileExpression(Parse("account.Entity"));
        var rv = Assert.IsType<DslRefValue>(result);
        Assert.Equal("bindingVar", rv.Ref.Kind);
        Assert.Equal("account", rv.Ref.Id);
        Assert.Equal("Entity", rv.Ref.Member);
    }

    [Fact]
    public void SimpleIdentifier_ReturnsRefValue()
    {
        var result = _sut.DecompileExpression(Parse("someVar"));
        var rv = Assert.IsType<DslRefValue>(result);
        Assert.Equal("bindingVar", rv.Ref.Kind);
        Assert.Equal("someVar", rv.Ref.Id);
    }

    [Fact]
    public void MethodCall_ReturnsRefValueWithCall()
    {
        var result = _sut.DecompileExpression(Parse("account.ToEntityReference()"));
        var rv = Assert.IsType<DslRefValue>(result);
        Assert.Equal("bindingVar", rv.Ref.Kind);
        Assert.Equal("account", rv.Ref.Id);
        Assert.Equal("ToEntityReference", rv.Ref.Call);
    }

    // ─── Interpolation ─────────────────────────────────────────────────────────

    [Fact]
    public void InterpolatedString_ReturnsInterpolationValue()
    {
        var result = _sut.DecompileExpression(Parse("$\"Hello {name}!\""));
        var iv = Assert.IsType<DslInterpolationValue>(result);
        Assert.Equal("Hello ${name}!", iv.Template);
    }
}
