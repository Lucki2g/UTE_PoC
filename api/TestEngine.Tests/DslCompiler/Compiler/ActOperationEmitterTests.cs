using TestEngine.Models.Dsl;
using TestEngine.Services.DslCompiler;

namespace TestEngine.Tests.DslCompiler.Compiler;

public class ActOperationEmitterTests
{
    private readonly List<DslDiagnostic> _diags = [];
    private readonly ValueCompiler _values;

    public ActOperationEmitterTests() => _values = new ValueCompiler(_diags);

    // ─── Create ────────────────────────────────────────────────────────────────

    [Fact]
    public void Create_Awaited_EmitsAwaitCreateAsync()
    {
        var emitter = new CreateOperationEmitter();
        var op = new DslOperation
        {
            Kind        = "create",
            GenericType = "Account",
            Entity      = new DslEntityRef { FromBinding = "account", Member = "Entity" },
            Awaited     = true
        };
        Assert.Equal("await AdminDao.CreateAsync<Account>(account.Entity)", emitter.Emit(op, "await "));
    }

    [Fact]
    public void Create_NotAwaited_EmitsSyncCreate()
    {
        var emitter = new CreateOperationEmitter();
        var op = new DslOperation
        {
            Kind   = "create",
            Entity = new DslEntityRef { FromBinding = "dev", Member = "Entity" }
        };
        Assert.Equal("AdminDao.Create(dev.Entity)", emitter.Emit(op, ""));
    }

    [Fact]
    public void Create_UnawaitedVariant_EmitsCreateUnawaitedAsync()
    {
        var emitter = new CreateOperationEmitter();
        var op = new DslOperation
        {
            Kind             = "create",
            GenericType      = "Account",
            Entity           = new DslEntityRef { FromBinding = "account", Member = "Entity" },
            Awaited          = true,
            UnawaitedVariant = true
        };
        Assert.Equal("await AdminDao.CreateUnawaitedAsync<Account>(account.Entity)", emitter.Emit(op, "await "));
    }

    // ─── Update ────────────────────────────────────────────────────────────────

    [Fact]
    public void Update_Awaited_EmitsUpdateAsync()
    {
        var emitter = new UpdateOperationEmitter();
        var op = new DslOperation
        {
            Kind        = "update",
            GenericType = "Account",
            Entity      = new DslEntityRef { FromBinding = "account", Member = "Entity" },
            Awaited     = true
        };
        Assert.Equal("await AdminDao.UpdateAsync<Account>(account.Entity)", emitter.Emit(op, "await "));
    }

    [Fact]
    public void Update_NotAwaited_EmitsSyncUpdate()
    {
        var emitter = new UpdateOperationEmitter();
        var op = new DslOperation
        {
            Kind   = "update",
            Entity = new DslEntityRef { FromBinding = "account", Member = "Entity" }
        };
        Assert.Equal("AdminDao.Update(account.Entity)", emitter.Emit(op, ""));
    }

    // ─── Delete ────────────────────────────────────────────────────────────────

    [Fact]
    public void Delete_Awaited_WithGenericType_EmitsDeleteAsync()
    {
        var emitter = new DeleteOperationEmitter(_diags, _values);
        var op = new DslOperation
        {
            Kind        = "delete",
            GenericType = "Account",
            Id          = new DslRefValue { Ref = new DslRefExpr { Kind = "bindingVar", Id = "accountId" } },
            Awaited     = true
        };
        Assert.Equal("await AdminDao.DeleteAsync<Account>(accountId)", emitter.Emit(op, "await "));
    }

    [Fact]
    public void Delete_MissingId_EmitsFallbackComment()
    {
        var emitter = new DeleteOperationEmitter(_diags, _values);
        var op = new DslOperation { Kind = "delete", Id = null };
        var result = emitter.Emit(op, "");
        Assert.Contains("missing id", result);
    }

    // ─── Associate / Disassociate ──────────────────────────────────────────────

    [Fact]
    public void Associate_Awaited_EmitsAssociateEntitiesAsync()
    {
        var emitter = new AssociateOperationEmitter(_diags, _values, "associate", "Associate");
        var op = new DslOperation
        {
            Kind             = "associate",
            RelationshipName = "ape_account_dev",
            Target           = new DslRefValue { Ref = new DslRefExpr { Kind = "bindingVar", Id = "account", Call = "ToEntityReference" } },
            Related          = new DslRelated { Kind = "single", Value = new DslRefValue { Ref = new DslRefExpr { Kind = "bindingVar", Id = "dev", Call = "ToEntityReference" } } },
            Awaited          = true
        };
        Assert.Equal(
            "await AdminDao.AssociateEntitiesAsync(\"ape_account_dev\", account.ToEntityReference(), dev.ToEntityReference())",
            emitter.Emit(op, "await "));
    }

    [Fact]
    public void Disassociate_UsesDisassociateVerb()
    {
        var emitter = new AssociateOperationEmitter(_diags, _values, "disassociate", "Disassociate");
        var op = new DslOperation
        {
            Kind             = "disassociate",
            RelationshipName = "ape_account_dev",
            Target           = new DslRefValue { Ref = new DslRefExpr { Kind = "bindingVar", Id = "a" } },
            Related          = new DslRelated { Kind = "single", Value = new DslRefValue { Ref = new DslRefExpr { Kind = "bindingVar", Id = "b" } } }
        };
        Assert.StartsWith("AdminDao.DisassociateEntities(", emitter.Emit(op, ""));
    }
}
