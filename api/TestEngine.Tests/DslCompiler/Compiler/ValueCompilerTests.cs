using TestEngine.Models.Dsl;
using TestEngine.Services.DslCompiler;

namespace TestEngine.Tests.DslCompiler.Compiler;

public class ValueCompilerTests
{
    private readonly List<DslDiagnostic> _diags = [];
    private readonly ValueCompiler _sut;

    public ValueCompilerTests() => _sut = new ValueCompiler(_diags);

    // ─── Primitive values ──────────────────────────────────────────────────────

    [Fact]
    public void CompileValue_String_EmitsEscapedQuotedString()
    {
        var result = _sut.CompileValue(new DslStringValue { Value = "hello \"world\"" });
        Assert.Equal("\"hello \\\"world\\\"\"", result);
    }

    [Fact]
    public void CompileValue_Integer_EmitsWithoutDecimalPoint()
    {
        var result = _sut.CompileValue(new DslNumberValue { Value = 42.0 });
        Assert.Equal("42", result);
    }

    [Fact]
    public void CompileValue_Double_DoesNotEmitAsInteger()
    {
        // Verify a non-whole number is not truncated — locale-agnostic check
        var result = _sut.CompileValue(new DslNumberValue { Value = 3.14 });
        Assert.NotEqual("3", result);
        Assert.StartsWith("3", result);
        Assert.True(result.Length > 1, $"Expected decimal digits but got: {result}");
    }

    [Fact]
    public void CompileValue_BooleanTrue_EmitsLowercase()
    {
        Assert.Equal("true", _sut.CompileValue(new DslBooleanValue { Value = true }));
    }

    [Fact]
    public void CompileValue_BooleanFalse_EmitsLowercase()
    {
        Assert.Equal("false", _sut.CompileValue(new DslBooleanValue { Value = false }));
    }

    [Fact]
    public void CompileValue_Null_EmitsNull()
    {
        Assert.Equal("null", _sut.CompileValue(new DslNullValue()));
    }

    [Fact]
    public void CompileValue_Guid_EmitsNewGuidExpression()
    {
        var result = _sut.CompileValue(new DslGuidValue { Value = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee" });
        Assert.Equal("new Guid(\"aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee\")", result);
    }

    // ─── Enum values ───────────────────────────────────────────────────────────

    [Fact]
    public void CompileValue_Enum_EmitsDotSeparated()
    {
        var result = _sut.CompileValue(new DslEnumValue { EnumType = "Account_StatusCode", Member = "Active" });
        Assert.Equal("Account_StatusCode.Active", result);
    }

    [Fact]
    public void CompileValue_EnumNumber_EmitsCast()
    {
        var result = _sut.CompileValue(new DslEnumNumberValue { EnumType = "MyEnum", Value = 5 });
        Assert.Equal("(MyEnum)5", result);
    }

    // ─── Interpolation ─────────────────────────────────────────────────────────

    [Fact]
    public void CompileValue_Interpolation_ConvertsTemplateMarkers()
    {
        var result = _sut.CompileValue(new DslInterpolationValue { Template = "Hello ${name}!" });
        Assert.Equal("$\"Hello {name}!\"", result);
    }

    // ─── References ───────────────────────────────────────────────────────────

    [Fact]
    public void CompileValue_RefBindingVar_EmitsIdentifier()
    {
        var result = _sut.CompileValue(new DslRefValue { Ref = new DslRefExpr { Kind = "bindingVar", Id = "account" } });
        Assert.Equal("account", result);
    }

    [Fact]
    public void CompileValue_RefBindingVarWithMember_EmitsDotAccess()
    {
        var result = _sut.CompileValue(new DslRefValue { Ref = new DslRefExpr { Kind = "bindingVar", Id = "account", Member = "Entity" } });
        Assert.Equal("account.Entity", result);
    }

    [Fact]
    public void CompileValue_RefBindingVarWithCall_EmitsMethodCall()
    {
        var result = _sut.CompileValue(new DslRefValue { Ref = new DslRefExpr { Kind = "bindingVar", Id = "account", Call = "ToEntityReference" } });
        Assert.Equal("account.ToEntityReference()", result);
    }

    [Fact]
    public void CompileValue_RefActResult_EmitsActResultVar()
    {
        _sut.SetActResultVar("createdId");
        var result = _sut.CompileValue(new DslRefValue { Ref = new DslRefExpr { Kind = "actResult" } });
        Assert.Equal("createdId", result);
    }

    // ─── Where expressions ─────────────────────────────────────────────────────

    [Fact]
    public void CompileWhereExpression_EqOp_EmitsEquality()
    {
        var where = new DslWhereExpression
        {
            Op    = "eq",
            Left  = new DslMemberExpr { Kind = "member", Root = "alias", Path = ["Id"] },
            Right = new DslStringValue { Value = "abc" }
        };
        Assert.Equal("a.Id == \"abc\"", _sut.CompileWhereExpression(where, "a"));
    }

    [Fact]
    public void CompileWhereExpression_AndOp_JoinsWithAmpersands()
    {
        var where = new DslWhereExpression
        {
            Op = "and",
            Items =
            [
                new DslWhereExpression { Op = "eq", Left = new DslMemberExpr { Kind = "member", Root = "alias", Path = ["Id"]   }, Right = new DslStringValue { Value = "x" } },
                new DslWhereExpression { Op = "eq", Left = new DslMemberExpr { Kind = "member", Root = "alias", Path = ["Name"] }, Right = new DslStringValue { Value = "y" } }
            ]
        };
        Assert.Equal("a.Id == \"x\" && a.Name == \"y\"", _sut.CompileWhereExpression(where, "a"));
    }

    // ─── Static helpers ────────────────────────────────────────────────────────

    [Fact]
    public void ToCSharpProducerCall_ThreePart_ReturnsLastPart()
    {
        Assert.Equal("Producer.DraftValidAccount", ValueCompiler.ToCSharpProducerCall("DataProducer.Account.DraftValidAccount"));
    }

    [Fact]
    public void ToCSharpProducerCall_TwoPart_ReturnsAsIs()
    {
        Assert.Equal("Producer.DraftValidAccount", ValueCompiler.ToCSharpProducerCall("Producer.DraftValidAccount"));
    }

    [Fact]
    public void DeriveLambdaParam_DraftValidAccount_ReturnsA()
    {
        Assert.Equal("a", ValueCompiler.DeriveLambdaParam("Producer.DraftValidAccount"));
    }

    [Fact]
    public void DeriveLambdaParam_DraftInvalidSkill_ReturnsS()
    {
        Assert.Equal("s", ValueCompiler.DeriveLambdaParam("Producer.DraftInvalidSkill"));
    }

    [Fact]
    public void DeriveClassName_AddsTestsSuffix()
    {
        Assert.Equal("MyFeatureTests", ValueCompiler.DeriveClassName("MyFeature_SomeScenario"));
    }

    [Fact]
    public void DeriveClassName_AlreadyHasTestsSuffix_NoDuplicate()
    {
        Assert.Equal("MyFeatureTests", ValueCompiler.DeriveClassName("MyFeatureTests_SomeScenario"));
    }
}
