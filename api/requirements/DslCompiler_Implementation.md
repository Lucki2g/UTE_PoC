# DSL Compiler Service — Implementation Guide

**Implements:** [CSharp_AAA_JSON_DSL.md](CSharp_AAA_JSON_DSL.md) (v1.2)
**Status:** Implemented

---

## 1. Overview

The `DslCompilerService` provides bi-directional translation between the JSON DSL and C# unit test code. It exposes three operations:

| Operation | Direction | Engine |
|-----------|-----------|--------|
| **Compile** | DSL JSON → C# source | StringBuilder-based code generation |
| **Decompile** | C# source → DSL JSON | Roslyn syntax analysis |
| **Validate** | C# source → pass/fail | Roslyn syntax diagnostics |

The service is registered as a singleton in DI and consumed by `TestService` for test CRUD operations.

---

## 2. File inventory

### Models (`Models/Dsl/`)

| File | Contents |
|------|----------|
| `DslTestDefinition.cs` | Full v1.2 schema — `DslTestDefinition` (envelope), `DslTest`, `DslArrange`, `DslBinding`, `DslAct`, `DslOperation`, `DslAssert`, `DslRetrieval`, `DslAssertion`, and all supporting types |
| `DslValueExpression.cs` | Polymorphic value hierarchy (`DslStringValue`, `DslNumberValue`, `DslBooleanValue`, `DslGuidValue`, `DslNullValue`, `DslEnumValue`, `DslEnumNumberValue`, `DslInterpolationValue`, `DslRefValue`) with `DslValueExpressionConverter` |
| `DslDiagnostic.cs` | `DslDiagnostic`, `DslDiagnosticCodes`, and result wrappers (`DslCompileResult`, `DslDecompileResult`, `DslValidationResult`) |

### Service (`Services/DslCompiler/`)

| File | Contents |
|------|----------|
| `IDslCompilerService.cs` | Public interface — three async methods returning rich result types |
| `DslCompilerService.cs` | Facade that delegates to the compiler, decompiler, and Roslyn validator |
| `DslCompileOptions.cs` | Compiler configuration (`EmitClassShell`, `ClassName`, `Namespace`, `BaseClass`, `FixtureType`) |
| `DslToCSharpCompiler.cs` | Internal — DSL → C# compilation logic |
| `CSharpToDslDecompiler.cs` | Internal — C# → DSL decompilation logic using Roslyn |

---

## 3. Interface

```csharp
public interface IDslCompilerService
{
    Task<DslCompileResult> CompileToCSharpAsync(DslTestDefinition dsl, DslCompileOptions? options = null);
    Task<DslDecompileResult> DecompileFromCSharpAsync(string csharpCode);
    Task<DslValidationResult> ValidateGeneratedCodeAsync(string csharpCode);
}
```

All methods return `Task<T>` for interface consistency, though the current implementations are synchronous internally.

### Result types

Each result pairs the primary output with a list of structured diagnostics:

```csharp
DslCompileResult    { string CSharpCode,          List<DslDiagnostic> Diagnostics }
DslDecompileResult  { DslTestDefinition Dsl,      List<DslDiagnostic> Diagnostics }
DslValidationResult { bool IsValid,               List<DslDiagnostic> Diagnostics }
```

---

## 4. Compiler (DSL → C#)

`DslToCSharpCompiler` uses `StringBuilder` to emit deterministic, formatted C# following the spec's canonical output template.

### 4.1 Compile options

| Option | Default | Description |
|--------|---------|-------------|
| `EmitClassShell` | `true` | When true, emits full class with namespace, class declaration, constructor. When false, emits method only. |
| `ClassName` | Derived from test name | Override the generated class name |
| `Namespace` | `"IntegrationTests"` | Override the generated namespace |
| `BaseClass` | `"TestBase"` | Base class for the test class |
| `FixtureType` | `"XrmMockupFixture"` | Constructor parameter type |

### 4.2 Framework attribute mapping

Implemented per spec section 5:

- **xUnit**: `[Fact]` / `[Theory]`, `[Trait("key","value")]`, `[Fact(Skip = "reason")]`
- **MSTest**: `[TestMethod]`, `[TestCategory("value")]`, `[Ignore("reason")]`, `[Timeout(ms)]`
- **NUnit**: `[Test]`, `[Category("value")]`, `[Ignore("reason")]`, `[Timeout(ms)]`
- **xUnit + timeout**: Emits `UNSUPPORTED_TIMEOUT_XUNIT` diagnostic (spec default, option 1)
- **Class-level**: MSTest → `[TestClass]`, NUnit → `[TestFixture]`, xUnit → none

### 4.3 Arrange compilation

Each binding emits a variable declaration with the Producer call, optional `.With()` chain, and optional `.Build()`:

```
var {var} = {producer.call}()
    .With({lambda} => {lambda}.{path} = {value})
    .Build();
```

The lambda parameter name is derived from the entity name in the producer call (e.g., `DraftValidAccount` → `a`).

### 4.4 Act compilation

Maps operation kind to `AdminDao` method:

| DSL kind | Sync method | Async method |
|----------|-------------|--------------|
| `create` | `AdminDao.Create(entity)` | `await AdminDao.CreateAsync(entity)` |
| `update` | `AdminDao.Update(entity)` | `await AdminDao.UpdateAsync(entity)` |
| `delete` | `AdminDao.Delete<T>(id)` | `await AdminDao.DeleteAsync<T>(id)` |
| `associate` | `AdminDao.AssociateEntities(rel, target, related)` | `await AdminDao.AssociateEntitiesAsync(...)` |
| `disassociate` | `AdminDao.DisassociateEntities(rel, target, related)` | `await AdminDao.DisassociateEntitiesAsync(...)` |

When `unawaitedVariant = true`, uses `*UnawaitedAsync` method names.

### 4.5 Assert compilation

- **Retrievals**: `var x = AdminDao.RetrieveFirstOrDefault(xrm => xrm.EntitySet.Where(alias => whereExpr))`
- **Where expressions**: `eq` → `==`, `and` → `&&`
- **Assertions**: `notNull` → `.Should().NotBeNull()`, `be` → `.Should().Be(expected)`, `containSingle` → `.Should().ContainSingle(predicate)`

**Null-conditional policy**: If a variable has a `notNull` assertion, subsequent member assertions use `.` directly. Otherwise, `?.` is used (e.g., `retrievedAccount?.Name.Should().Be(...)`).

### 4.6 Value compilation

| DSL type | C# output |
|----------|-----------|
| `string` | `"text"` |
| `number` | `123` (integer if whole) |
| `boolean` | `true` / `false` |
| `guid` | `new Guid("...")` |
| `null` | `null` |
| `enum` | `EnumType.Member` |
| `enumNumber` | `(EnumType)123` |
| `interpolation` | `$"{expr}"` (`${...}` → `{...}`) |
| `ref` (bindingVar + member) | `id.member` |
| `ref` (bindingVar + call) | `id.call()` |
| `ref` (actResult) | Resolves to the act result variable name |

---

## 5. Decompiler (C# → DSL)

`CSharpToDslDecompiler` uses Roslyn's `CSharpSyntaxTree.ParseText` to parse C# source code and extract the DSL structure.

### 5.1 Processing pipeline

1. **Parse** the C# source into a Roslyn syntax tree
2. **Find** the first method with a test attribute (`[Fact]`, `[Theory]`, `[TestMethod]`, `[Test]`)
3. **Detect framework** from the attribute name
4. **Extract metadata**: kind, name, async modifier, traits, timeout, ignore/skip reason
5. **Split AAA sections**:
   - Primary: `// Arrange`, `// Act`, `// Assert` comment markers
   - Fallback: heuristics — `Producer.*` calls → Arrange, first `AdminDao.*` non-Retrieve → Act, rest → Assert
6. **Parse Arrange**: Unwrap fluent `Producer.Draft*().With(...).Build()` chains from outside-in
7. **Parse Act**: Detect `AdminDao.Create/Update/Delete/AssociateEntities/DisassociateEntities`, extract result variable, generic type, entity arguments
8. **Parse Assert**: Separate `AdminDao.Retrieve*` retrievals from `.Should().*` assertions
9. **Emit diagnostics** for unsupported fragments

### 5.2 Fluent chain unwrapping

The decompiler walks invocation chains from the outermost call inward:

```
Build(With(With(DraftValidAccount())))
  ↓ unwrap Build → hasBuild = true
  ↓ unwrap With → collect mutation
  ↓ unwrap With → collect mutation
  ↓ hit Producer.DraftValidAccount → producerCall
```

Mutations are inserted at position 0 during unwinding so the final list preserves source order.

### 5.3 Assertion target handling

The decompiler handles both standard and null-conditional access patterns:

- `retrievedAccount.Should().NotBeNull()` → target kind `var`
- `retrievedAccount?.Name.Should().Be(...)` → target kind `member` with `?.` detected via `ConditionalAccessExpression`
- `retrievedAccount.Name.Should().Be(...)` → target kind `member` via `MemberAccessExpression`

### 5.4 Enum detection heuristic

Without semantic analysis, the decompiler uses a naming heuristic for enum detection:
- `Account_CustomerTypeCode.Customer` → contains `_` → strong enum signal → `DslEnumValue`
- `PascalCase.PascalCase` without dots → possible enum → `DslEnumValue`
- Otherwise → `DslRefValue` (binding member access)

---

## 6. Validator

`ValidateGeneratedCodeAsync` performs syntax-only validation using Roslyn:

1. Parse the C# code with `CSharpSyntaxTree.ParseText`
2. Collect all diagnostics with `Error` severity
3. Return `IsValid = true` if no errors

This catches malformed code from the compiler but does **not** perform semantic validation (e.g., missing type references). Full semantic validation would require loading assembly references for FluentAssertions, Xrm SDK, etc.

---

## 7. Diagnostics

Both compiler and decompiler emit structured diagnostics alongside their results. Diagnostics are non-fatal — the operation completes and returns whatever it can, with diagnostics explaining gaps.

### 7.1 Diagnostic codes

| Code | Emitted by | Trigger |
|------|-----------|---------|
| `UNSUPPORTED_ASSERTION` | Compiler, Decompiler | Assertion kind not in {notNull, be, containSingle} |
| `UNSUPPORTED_LINQ_SHAPE` | Decompiler | Where predicate could not be parsed |
| `MULTIPLE_ACT_CALLS` | Decompiler | More than one AdminDao non-Retrieve call found |
| `MISSING_AAA_SECTIONS` | Decompiler | Could not identify Arrange/Act/Assert split |
| `AMBIGUOUS_TEST_FRAMEWORK` | Decompiler | No recognized test attribute found |
| `UNSUPPORTED_TIMEOUT_XUNIT` | Compiler | xUnit test with `timeoutMs` set |
| `UNKNOWN_OPERATION_KIND` | Compiler | Unrecognized operation kind in Act section |
| `UNRESOLVED_REFERENCE` | Compiler | A ref expression could not be resolved |

### 7.2 Diagnostic structure

```json
{
  "code": "UNSUPPORTED_TIMEOUT_XUNIT",
  "message": "xUnit does not have a built-in [Timeout] attribute. Requested timeout: 30000ms.",
  "location": {
    "section": "test",
    "hint": "timeoutMs: 30000"
  }
}
```

---

## 8. JSON serialization

### 8.1 Value expression polymorphism

`DslValueExpression` uses a custom `JsonConverter` (`DslValueExpressionConverter`) that reads the `"type"` discriminator field to select the concrete subtype:

```json
{ "type": "string", "value": "text" }         → DslStringValue
{ "type": "enum", "enumType": "...", "member": "..." } → DslEnumValue
{ "type": "ref", "ref": { "kind": "actResult" } }      → DslRefValue
```

### 8.2 Where expression recursion

`DslWhereExpression` uses a custom `JsonConverter` (`DslWhereExpressionConverter`) to handle recursive `"and"` items while avoiding infinite converter loops.

---

## 9. Known limitations (v1.2)

| Area | Limitation |
|------|-----------|
| Theory data | Only xUnit `[Theory]` is compiled; MSTest/NUnit emit a diagnostic |
| LINQ shapes | Only `.Where(predicate)` is supported — no `Select`, `First()`, joins |
| Assertion methods | Only `NotBeNull`, `Be`, `ContainSingle` |
| Decompiler enum detection | Heuristic-based (no semantic model) — may misclassify static class members as enums |
| Validation | Syntax-only — no semantic/type checking |
| Multiple test methods | Decompiler extracts the first test method in the file |
| `With()` paths | Simple identifiers only — no nested `A.B.C` paths |

---

## 10. Usage examples

### 10.1 Compile DSL to C#

```csharp
var dsl = new DslTestDefinition
{
    Test = new DslTest
    {
        Framework = "xunit",
        Kind = "test",
        Name = "CreateAccount_ReturnsCorrectName",
        Arrange = new DslArrange
        {
            Bindings =
            [
                new DslBinding
                {
                    Id = "account",
                    Var = "account",
                    Producer = new DslProducerCall { Call = "Producer.DraftValidAccount" }
                }
            ]
        },
        Act = new DslAct
        {
            ResultVar = "createdAccountId",
            Operation = new DslOperation
            {
                Kind = "create",
                GenericType = "Account",
                Entity = new DslEntityRef { FromBinding = "account", Member = "Entity" }
            }
        },
        Assert = new DslAssert
        {
            Retrievals =
            [
                new DslRetrieval
                {
                    Var = "retrievedAccount",
                    Kind = "retrieveFirstOrDefault",
                    EntitySet = "AccountSet",
                    Alias = "a",
                    Where = new DslWhereExpression
                    {
                        Op = "eq",
                        Left = new DslMemberExpr { Root = "alias", Path = ["Id"] },
                        Right = new DslRefValue
                        {
                            Ref = new DslRefExpr { Kind = "actResult" }
                        }
                    }
                }
            ],
            Assertions =
            [
                new DslAssertion
                {
                    Kind = "notNull",
                    Target = new DslAssertionTarget { Kind = "var", Name = "retrievedAccount" }
                }
            ]
        }
    }
};

var service = new DslCompilerService();
var result = await service.CompileToCSharpAsync(dsl);
// result.CSharpCode contains the generated C# test class
// result.Diagnostics contains any warnings
```

### 10.2 Decompile C# to DSL

```csharp
var csharp = """
    [Fact]
    public void CreateAccount()
    {
        // Arrange
        var account = Producer.DraftValidAccount();

        // Act
        var createdAccountId = AdminDao.Create(account.Entity);

        // Assert
        var retrievedAccount = AdminDao.RetrieveFirstOrDefault(
            xrm => xrm.AccountSet.Where(a => a.Id == createdAccountId));
        retrievedAccount.Should().NotBeNull();
    }
    """;

var service = new DslCompilerService();
var result = await service.DecompileFromCSharpAsync(csharp);
// result.Dsl contains the structured DslTestDefinition
// result.Diagnostics contains any warnings about unparseable fragments
```

### 10.3 Validate generated code

```csharp
var service = new DslCompilerService();
var result = await service.ValidateGeneratedCodeAsync(generatedCSharp);
if (!result.IsValid)
{
    foreach (var diag in result.Diagnostics)
        Console.WriteLine($"{diag.Code}: {diag.Message}");
}
```
