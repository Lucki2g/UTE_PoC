# Extending the DSL Compiler

This guide explains how to add new capabilities to the DSL compiler/decompiler system. The system is registry-based: adding a new operation or assertion function requires creating focused files and adding one registration line per direction (compile + decompile).

---

## Table of Contents

1. [Architecture overview](#1-architecture-overview)
2. [Add a new Assert function](#2-add-a-new-assert-function)
   e.g. `haveCount`, `beGreaterThan`, `beEmpty`
3. [Add a new Act operation](#3-add-a-new-act-operation)
   e.g. `upsert`, `execute`, a custom DAO method
4. [Add a new LINQ / retrieval shape (decompiler)](#4-add-a-new-linq--retrieval-shape-decompiler)
5. [Add a new Arrange / Producer pattern (decompiler)](#5-add-a-new-arrange--producer-pattern-decompiler)
6. [Frontend: reflect changes in the diagram UI](#6-frontend-reflect-changes-in-the-diagram-ui)
7. [Writing tests](#7-writing-tests)
8. [Quick-reference: registration lines](#8-quick-reference-registration-lines)

---

## 1. Architecture overview

```
api/Services/DslCompiler/
├── DslToCSharpCompiler.cs          ← compiler orchestrator (register emitters here)
├── CSharpToDslDecompiler.cs        ← decompiler orchestrator (register parsers here)
└── Subcomponents/
    ├── DslSubcomponentBase.cs      ← base class: diagnostics helper
    ├── Compiler/
    │   ├── IActOperationEmitter.cs
    │   ├── IAssertionFunctionEmitter.cs
    │   ├── ValueCompiler.cs        ← shared: CompileValue, CompilePredicateExpression, …
    │   ├── ArrangeEmitter.cs
    │   ├── ActEmitter.cs           ← dispatches by op.Kind
    │   ├── AssertEmitter.cs        ← dispatches by assertion.Kind
    │   ├── ActOperations/          ← one file per Act kind
    │   └── AssertFunctions/        ← one file per Assert kind
    └── Decompiler/
        ├── IActOperationParser.cs
        ├── IAssertionFunctionParser.cs
        ├── ExpressionDecompiler.cs ← shared: DecompileExpression
        ├── TestMethodParser.cs
        ├── AaaSectionSplitter.cs
        ├── ArrangeParser.cs
        ├── ActParser.cs            ← dispatches by normalized method name
        ├── AssertParser.cs         ← dispatches by FluentAssertions method name
        ├── ActOperations/          ← one file per Act kind
        └── AssertFunctions/        ← one file per Assert kind
```

**Flow (compiler):** `DslTestDefinition` JSON → `DslToCSharpCompiler.Compile()` → `ActEmitter` / `AssertEmitter` look up the registered emitter by `Kind` → emit C# code.

**Flow (decompiler):** C# source → Roslyn syntax tree → `CSharpToDslDecompiler.Decompile()` → `ActParser` / `AssertParser` look up the registered parser by method name → produce `DslTestDefinition`.

Both dispatch steps use a `Dictionary<string, IXxx>` built once in the constructor. An unrecognised kind emits a diagnostic and a fallback comment, so unregistered items degrade gracefully.

---

## 2. Add a new Assert function

**Example:** adding `haveCount` — emits `target.Should().HaveCount(n)` and decompiles `HaveCount(...)`.

### Step 1 — Add the DSL kind to the model (if needed)

If the new kind carries data that `DslAssertion` does not already model (beyond `Kind`, `Target`, `Expected`, `Predicate`), add a field to `DslAssertion` in:

- **Backend:** `api/Models/Dsl/DslAssertion.cs`
- **Frontend:** `web/src/models/dsl.ts` (`DslAssertion` interface)

For `haveCount` the existing `Expected` field is sufficient (it holds the count value).

### Step 2 — Create the emitter

**File:** `api/Services/DslCompiler/Subcomponents/Compiler/AssertFunctions/HaveCountAssertionEmitter.cs`

```csharp
using System.Text;
using TestEngine.Models.Dsl;

namespace TestEngine.Services.DslCompiler;

internal sealed class HaveCountAssertionEmitter : IAssertionFunctionEmitter
{
    private readonly ValueCompiler _values;

    public HaveCountAssertionEmitter(ValueCompiler values) => _values = values;

    public string Kind => "haveCount";

    public void Emit(StringBuilder sb, DslAssertion assertion, string compiledTarget, string indent)
    {
        var expected = assertion.Expected != null ? _values.CompileValue(assertion.Expected) : "0";
        sb.AppendLine($"{indent}{compiledTarget}.Should().HaveCount({expected});");
    }
}
```

Key points:
- Implement `IAssertionFunctionEmitter`
- `Kind` must exactly match the DSL `kind` string used in test definitions
- Use `_values.CompileValue(assertion.Expected)` for the expected argument
- Use `_values.CompilePredicateExpression(assertion.Predicate)` if you need a lambda predicate

### Step 3 — Create the parser

**File:** `api/Services/DslCompiler/Subcomponents/Decompiler/AssertFunctions/HaveCountAssertionParser.cs`

```csharp
using Microsoft.CodeAnalysis.CSharp.Syntax;
using TestEngine.Models.Dsl;

namespace TestEngine.Services.DslCompiler;

internal sealed class HaveCountAssertionParser : IAssertionFunctionParser
{
    private readonly ExpressionDecompiler _expr;

    public HaveCountAssertionParser(ExpressionDecompiler expr) => _expr = expr;

    // Must match the FluentAssertions method name exactly (case-sensitive)
    public string MethodName => "HaveCount";

    public DslAssertion? Parse(InvocationExpressionSyntax outerInvocation, DslAssertionTarget target)
    {
        if (outerInvocation.ArgumentList.Arguments.Count == 0) return null;

        return new DslAssertion
        {
            Kind     = "haveCount",
            Target   = target,
            Expected = _expr.DecompileExpression(
                outerInvocation.ArgumentList.Arguments[0].Expression)
        };
    }
}
```

Key points:
- Implement `IAssertionFunctionParser`
- `MethodName` must match the FluentAssertions chain method exactly: `x.Should().HaveCount(...)` → `"HaveCount"`
- Return `null` to signal "I can't parse this" — the caller will emit a diagnostic

### Step 4 — Register in both orchestrators

**Compiler** — `api/Services/DslCompiler/DslToCSharpCompiler.cs`, inside the `_assert` registration array:

```csharp
_assert = new AssertEmitter(_diagnostics, _values,
[
    new NotNullAssertionEmitter(),
    new BeAssertionEmitter(_values),
    new ContainSingleAssertionEmitter(_values),
    new HaveCountAssertionEmitter(_values),   // ← add this line
]);
```

**Decompiler** — `api/Services/DslCompiler/CSharpToDslDecompiler.cs`, inside the `_assertParser` registration array:

```csharp
_assertParser = new AssertParser(_diagnostics, expr,
[
    new NotNullAssertionParser(),
    new BeAssertionParser(expr),
    new ContainSingleAssertionParser(expr),
    new HaveCountAssertionParser(expr),       // ← add this line
]);
```

### Step 5 — Write tests

See [§7 Writing tests](#7-writing-tests).

---

## 3. Add a new Act operation

**Example:** adding `upsert` — emits `AdminDao.UpsertAsync<T>(entity)` and decompiles `UpsertAsync(...)`.

### Step 1 — Create the emitter

**File:** `api/Services/DslCompiler/Subcomponents/Compiler/ActOperations/UpsertOperationEmitter.cs`

```csharp
using TestEngine.Models.Dsl;

namespace TestEngine.Services.DslCompiler;

internal sealed class UpsertOperationEmitter : IActOperationEmitter
{
    public string Kind => "upsert";

    public string Emit(DslOperation op, string awaitPrefix)
    {
        var entityArg = ValueCompiler.CompileEntityRef(op.Entity);
        var generic   = op.GenericType != null ? $"<{op.GenericType}>" : "";
        var method    = op.Awaited
            ? (op.UnawaitedVariant ? "UpsertUnawaitedAsync" : "UpsertAsync")
            : "Upsert";
        return $"{awaitPrefix}AdminDao.{method}{generic}({entityArg})";
    }
}
```

If your emitter needs to emit a diagnostic (e.g. unsupported combination), inherit `DslSubcomponentBase` and call `AddDiagnostic(...)`, passing `diagnostics` in the constructor — see `DeleteOperationEmitter` as an example.

### Step 2 — Create the parser

**File:** `api/Services/DslCompiler/Subcomponents/Decompiler/ActOperations/UpsertOperationParser.cs`

```csharp
using Microsoft.CodeAnalysis;
using Microsoft.CodeAnalysis.CSharp.Syntax;
using TestEngine.Models.Dsl;

namespace TestEngine.Services.DslCompiler;

internal sealed class UpsertOperationParser : IActOperationParser
{
    // The parser is registered under the normalised method name.
    // "Upsert" matches UpsertAsync, UpsertUnawaitedAsync, Upsert (normalised by ActParser).
    public string NormalizedMethodName => "Upsert";

    public DslOperation Parse(
        SeparatedSyntaxList<ArgumentSyntax> args,
        string? genericType,
        bool awaited,
        bool unawaitedVariant)
    {
        return new DslOperation
        {
            Kind             = "upsert",
            GenericType      = genericType,
            Entity           = ParseEntityArg(args),
            Awaited          = awaited,
            UnawaitedVariant = unawaitedVariant,
        };
    }

    private static DslEntityRef? ParseEntityArg(SeparatedSyntaxList<ArgumentSyntax> args)
    {
        if (args.Count == 0) return null;
        var expr = args[0].Expression;
        return expr is MemberAccessExpressionSyntax ma
            ? new DslEntityRef { FromBinding = ma.Expression.ToString(), Member = ma.Name.Identifier.Text }
            : new DslEntityRef { FromBinding = expr.ToString(), Member = "Entity" };
    }
}
```

> **How `NormalizedMethodName` works:** `ActParser` strips known async suffixes (`Async`, `UnawaitedAsync`) from the call site method name before looking up the registry. So `UpsertAsync`, `UpsertUnawaitedAsync`, and `Upsert` all resolve to `"Upsert"`.

### Step 3 — Register in both orchestrators

**Compiler** — `DslToCSharpCompiler.cs`:

```csharp
_act = new ActEmitter(_diagnostics, _values,
[
    new CreateOperationEmitter(),
    new UpdateOperationEmitter(),
    new DeleteOperationEmitter(_diagnostics, _values),
    new AssociateOperationEmitter(_diagnostics, _values, "associate",    "Associate"),
    new AssociateOperationEmitter(_diagnostics, _values, "disassociate", "Disassociate"),
    new UpsertOperationEmitter(),   // ← add this line
]);
```

**Decompiler** — `CSharpToDslDecompiler.cs`:

```csharp
_actParser = new ActParser(_diagnostics,
[
    new CreateOperationParser(),
    new UpdateOperationParser(),
    new DeleteOperationParser(expr),
    new RelationshipOperationParser(expr, "AssociateEntities",    "associate"),
    new RelationshipOperationParser(expr, "DisassociateEntities", "disassociate"),
    new UpsertOperationParser(),    // ← add this line
]);
```

### Step 4 — Add the operation kind to the frontend

In `web/src/util/dsl/shared/operationKinds.ts`, add the new kind to both maps:

```typescript
export function mapOperationKind(op: string): string {
    const map: Record<string, string> = {
        // …existing entries…
        Upsert: "upsert",   // ← add
    };
    return map[op] ?? op.toLowerCase();
}

export function mapOperationBack(kind: string): ServiceNodeData["operation"] {
    const map: Record<string, ServiceNodeData["operation"]> = {
        // …existing entries…
        // Note: only add if "Upsert" becomes a selectable UI operation
    };
    return map[kind] ?? "Create";
}
```

If the operation is selectable in the visual builder, also update `ServiceNodeData["operation"]` in `web/src/models/builder.ts` and add it to the operation dropdown in `web/src/components/nodes/dao/ServiceNode.tsx`.

---

## 4. Add a new LINQ / retrieval shape (decompiler)

The decompiler maps C# LINQ query patterns in the Assert section to `DslRetrieval` objects. This logic lives in `AssertParser.cs`.

The current supported shapes are:
- `AdminDao.RetrieveMultipleAsync<T>(set => set.Where(…))` → `retrieveMultiple`
- `AdminDao.RetrieveFirstOrDefaultAsync<T>(set => set.Where(…))` → `retrieveFirstOrDefault`

To support a new shape (e.g. `RetrieveCountAsync`):

### Step 1 — Extend the `DslRetrieval` kind list

In `web/src/models/dsl.ts`, the `kind` field on `DslRetrieval` is an open `string`. Document the new kind string (e.g. `"retrieveCount"`) in a comment. No code change needed in the model itself.

### Step 2 — Extend `AssertParser.ParseRetrieval`

**File:** `api/Services/DslCompiler/Subcomponents/Decompiler/AssertParser.cs`

Find the method that matches AdminDao retrieval calls (look for `RetrieveMultiple` / `RetrieveFirstOrDefault` matching). Add a new branch:

```csharp
case "RetrieveCount":
case "RetrieveCountAsync":
    retrieval = new DslRetrieval
    {
        Var       = variableName,
        Kind      = "retrieveCount",
        EntitySet = genericType ?? "unknown",
        Alias     = alias,
        Where     = where,
    };
    break;
```

### Step 3 — Extend the compiler `AssertEmitter`

**File:** `api/Services/DslCompiler/Subcomponents/Compiler/AssertEmitter.cs`

Find the retrieval emission loop. Add a case for the new kind:

```csharp
"retrieveCount" => $"{awaitPrefix}AdminDao.RetrieveCountAsync<{r.EntitySet}>(set => set.Where({lambdaParam} => {where}))",
```

### Step 4 — Extend the frontend loader

In `web/src/util/dsl/loader/assertLoader.ts`, where `r.kind` is mapped to a `ServiceNodeData.operation`:

```typescript
const operation = r.kind === "retrieveList" || r.kind === "retrieveMultiple"
    ? "RetrieveList" as const
    : "RetrieveSingle" as const;
// Add: r.kind === "retrieveCount" → a new "RetrieveCount" UI operation (if needed)
```

---

## 5. Add a new Arrange / Producer pattern (decompiler)

The `ArrangeParser` recognises producer calls by the presence of `Producer.` in the method chain. This covers all standard producers automatically.

**When to extend:** if the test code uses a different factory pattern that doesn't go through `Producer.Xxx.DraftYyy()` (e.g. a raw entity constructor or a helper method).

### Approach

Extend `ArrangeParser.TryParseProducerBinding` in `api/Services/DslCompiler/Subcomponents/Decompiler/ArrangeParser.cs` to recognise the new pattern:

```csharp
// Example: recognise "EntityFactory.CreateAccount()" as a producer binding
if (callText.Contains("EntityFactory."))
{
    producerCall = callText;
    break;
}
```

Then map the normalised call to a `DslBinding` in the same way the existing code does.

**For the compiler side**, the `ArrangeEmitter` calls `ValueCompiler.ToCSharpProducerCall()` to translate DSL call names back to C#. Update that helper in `api/Services/DslCompiler/Subcomponents/Compiler/ValueCompiler.cs` if the new pattern produces a different C# call format:

```csharp
public static string ToCSharpProducerCall(string dslCall)
{
    // existing logic …
    // add: handle "EntityFactory.*" prefix if needed
}
```

---

## 6. Frontend: reflect changes in the diagram UI

The frontend's DSL generator and loader are in:

```
web/src/util/
├── dslGenerator.ts              ← orchestrator
├── dslLoader.ts                 ← orchestrator
└── dsl/
    ├── shared/operationKinds.ts ← mapOperationKind, mapOperationBack, parseStringValue
    ├── generator/
    │   ├── arrangeGenerator.ts
    │   ├── actGenerator.ts      ← edit for new Act kinds
    │   └── assertGenerator.ts   ← edit for new Assert kinds
    └── loader/
        ├── arrangeLoader.ts
        ├── actLoader.ts         ← edit for new Act kinds
        └── assertLoader.ts      ← edit for new Assert kinds
```

### New Assert kind in the visual builder

1. **`assertGenerator.ts`** — the `generateAssertions` function maps `AssertNodeData.assertionKind` to a `DslAssertion`. No change needed if you only added `kind` + `expected` — the existing mapping handles all string `assertionKind` values.

2. **`assertLoader.ts`** — the `loadAssert` function maps `DslAssertion` back to `AssertNodeData`. Same: no change needed for `kind` + `expected`.

3. **`AssertNode.tsx`** — if the assert node UI needs a new input field (e.g. a count input for `haveCount`), update the node component in `web/src/components/nodes/assert/AssertNode.tsx`.

4. **`ComponentExplorer.tsx`** — add a new draggable assert item to the palette if needed.

### New Act kind in the visual builder

1. **`operationKinds.ts`** — add to `mapOperationKind` and `mapOperationBack`
2. **`actGenerator.ts`** — update `generateAct` if the new kind needs different field mapping
3. **`actLoader.ts`** — update `loadAct` if the new kind needs to restore different fields
4. **`ServiceNode.tsx`** and `builder.ts` — add to the `operation` union type if it becomes a selectable UI operation

---

## 7. Writing tests

Tests live in `api/TestEngine.Tests/DslCompiler/` mirroring the subcomponent structure.

### Unit test for a new Assert emitter + parser

Add to the appropriate file in `api/TestEngine.Tests/DslCompiler/Compiler/AssertionFunctionEmitterTests.cs`:

```csharp
[Fact]
public void HaveCountEmitter_WithExpected_EmitsHaveCount()
{
    var emitter   = new HaveCountAssertionEmitter(_values);
    var assertion = new DslAssertion
    {
        Kind     = "haveCount",
        Target   = new DslAssertionTarget { Kind = "var", Name = "items" },
        Expected = new DslNumberValue { Value = 3.0 }
    };
    var result = Emit(emitter, assertion, "items");   // uses the helper in the test class
    Assert.Equal("items.Should().HaveCount(3);", result);
}
```

Add to `api/TestEngine.Tests/DslCompiler/Decompiler/AssertionFunctionParserTests.cs`:

```csharp
[Fact]
public void HaveCountParser_WithIntArg_ReturnsHaveCountAssertion()
{
    var parser = new HaveCountAssertionParser(_expr);
    var (outer, target) = ParseAssertion("items.Should().HaveCount(3)");
    var result = parser.Parse(outer, target);

    Assert.NotNull(result);
    Assert.Equal("haveCount", result!.Kind);
    var nv = Assert.IsType<DslNumberValue>(result.Expected);
    Assert.Equal(3.0, nv.Value);
}
```

### Round-trip test

Add to `api/TestEngine.Tests/DslCompilerRoundTripTests.cs` to verify the full compile → decompile cycle:

```csharp
[Fact]
public void RoundTrip_HaveCountAssertion()
{
    const string csharp = """
        [Fact]
        public async Task Items_HaveExpectedCount()
        {
            // Arrange
            var account = Producer.Account.DraftValidAccount();

            // Act
            var createdId = await AdminDao.CreateAsync<Account>(account.Entity);

            // Assert
            var items = await AdminDao.RetrieveMultipleAsync<Item>(set =>
                set.Where(x => x.account_id == createdId));
            items.Should().HaveCount(3);
        }
        """;

    var result = _decompiler.Decompile(csharp);
    Assert.Empty(result.Diagnostics);

    var assertion = result.Dsl.Test.Assert.Assertions.Single();
    Assert.Equal("haveCount", assertion.Kind);

    var compiled = _compiler.Compile(result.Dsl);
    Assert.Contains("HaveCount(3)", compiled.CSharpCode);
}
```

### Unit test for a new Act emitter + parser

Add to `api/TestEngine.Tests/DslCompiler/Compiler/ActOperationEmitterTests.cs`:

```csharp
[Fact]
public void UpsertEmitter_Awaited_EmitsUpsertAsync()
{
    var emitter = new UpsertOperationEmitter();
    var op = new DslOperation
    {
        Kind        = "upsert",
        GenericType = "Account",
        Entity      = new DslEntityRef { FromBinding = "account", Member = "Entity" },
        Awaited     = true
    };
    var result = emitter.Emit(op, "await ");
    Assert.Equal("await AdminDao.UpsertAsync<Account>(account.Entity)", result);
}
```

Add to `api/TestEngine.Tests/DslCompiler/Decompiler/ActOperationParserTests.cs`:

```csharp
[Fact]
public void UpsertParser_ReturnsUpsertOperation()
{
    var parser = new UpsertOperationParser();
    var args   = ParseArgs("AdminDao.UpsertAsync<Account>(account.Entity)");
    var result = parser.Parse(args, "Account", awaited: true, unawaitedVariant: false);

    Assert.Equal("upsert",  result.Kind);
    Assert.Equal("Account", result.GenericType);
    Assert.True(result.Awaited);
}
```

### Run the tests

```bash
dotnet test api/TestEngine.Tests/TestEngine.Tests.csproj --verbosity quiet
```

---

## 8. Quick-reference: registration lines

### New Assert function checklist

| # | What | File |
|---|------|------|
| 1 | Create `XxxAssertionEmitter.cs` (implement `IAssertionFunctionEmitter`) | `Subcomponents/Compiler/AssertFunctions/` |
| 2 | Create `XxxAssertionParser.cs` (implement `IAssertionFunctionParser`) | `Subcomponents/Decompiler/AssertFunctions/` |
| 3 | Add `new XxxAssertionEmitter(…)` | `DslToCSharpCompiler.cs` → `_assert` array |
| 4 | Add `new XxxAssertionParser(…)` | `CSharpToDslDecompiler.cs` → `_assertParser` array |
| 5 | Emitter test | `TestEngine.Tests/DslCompiler/Compiler/AssertionFunctionEmitterTests.cs` |
| 6 | Parser test | `TestEngine.Tests/DslCompiler/Decompiler/AssertionFunctionParserTests.cs` |
| 7 | Round-trip test | `TestEngine.Tests/DslCompilerRoundTripTests.cs` |

### New Act operation checklist

| # | What | File |
|---|------|------|
| 1 | Create `XxxOperationEmitter.cs` (implement `IActOperationEmitter`) | `Subcomponents/Compiler/ActOperations/` |
| 2 | Create `XxxOperationParser.cs` (implement `IActOperationParser`) | `Subcomponents/Decompiler/ActOperations/` |
| 3 | Add `new XxxOperationEmitter(…)` | `DslToCSharpCompiler.cs` → `_act` array |
| 4 | Add `new XxxOperationParser(…)` | `CSharpToDslDecompiler.cs` → `_actParser` array |
| 5 | Add kind to `mapOperationKind` | `web/src/util/dsl/shared/operationKinds.ts` |
| 6 | Add kind to `mapOperationBack` (if UI-selectable) | `web/src/util/dsl/shared/operationKinds.ts` |
| 7 | Emitter test | `TestEngine.Tests/DslCompiler/Compiler/ActOperationEmitterTests.cs` |
| 8 | Parser test | `TestEngine.Tests/DslCompiler/Decompiler/ActOperationParserTests.cs` |
| 9 | Round-trip test | `TestEngine.Tests/DslCompilerRoundTripTests.cs` |

### Symmetric operations (associate/disassociate pattern)

For operations that share one class but differ by `kind` string (like associate/disassociate), use constructor parameters and register two instances:

```csharp
// Compiler registration (DslToCSharpCompiler.cs)
new MySymmetricEmitter(_diagnostics, _values, "kindA", "VerbA"),
new MySymmetricEmitter(_diagnostics, _values, "kindB", "VerbB"),

// Decompiler registration (CSharpToDslDecompiler.cs)
new MySymmetricParser(expr, "MethodNameA", "kindA"),
new MySymmetricParser(expr, "MethodNameB", "kindB"),
```

See `AssociateOperationEmitter` and `RelationshipOperationParser` for the full implementation pattern.
