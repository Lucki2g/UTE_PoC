# C# AAA Test ↔ JSON DSL Specification (JSON DSL)
**Version:** 1.2  
**Status:** Draft  
**Scope:** Bi-directional compiler/decompiler between constrained C# AAA-style unit tests and a structured JSON DSL.

---

## 1. Overview

This document defines a **domain-specific language (DSL)** expressed in JSON for representing unit tests written in C# using the AAA pattern:

- **Arrange** — Data creation via `Producer` drafts and `.With(...)` mutation, optional `.Build()`
- **Act** — Exactly one CRUD or relationship operation via `AdminDao`
- **Assert** — Retrieval(s) via `AdminDao` followed by a supported subset of FluentAssertions

Supported test frameworks:
- **xUnit**
- **MSTest**
- **NUnit**

This DSL is designed for **round-tripping**:
- `C# → DSL → C#` should preserve **semantic meaning** and compile to equivalent behavior.
- `DSL → C# → DSL` should produce a normalized DSL form (canonicalization may reorder minor details but not meaning).

---

## 2. Goals and non-goals

### 2.1 Goals
1. **Round-trip correctness** for supported constructs.
2. **Deterministic output** from the compiler (stable formatting and ordering).
3. **Constrained yet expressive** modeling for Producer/AdminDao/FluentAssertions patterns.
4. **Framework independence** via normalized metadata fields.
5. **Extensibility** for future assertion/query support without breaking existing DSL.

### 2.2 Non-goals
- Full C# parsing or arbitrary C# code modeling.
- Supporting arbitrary LINQ (joins, projections, GroupBy, etc.).
- Supporting arbitrary assertions or custom assertion libraries.
- Preserving exact whitespace/comments of the original C# (beyond optional metadata).
- Modeling all `AdminDao` methods; only the allowed subset is supported by the Act section.

---

## 3. Top-level DSL structure

```json
{
  "dslVersion": "1.2",
  "language": "csharp-aaa",
  "test": {
    "...": "see sections below"
  }
}
```

### 3.1 Required fields
- `dslVersion`: semantic version string
- `language`: fixed string `"csharp-aaa"`
- `test`: the test object

---

## 4. Test object

```json
{
  "framework": "xunit" | "mstest" | "nunit",
  "kind": "test" | "theory",
  "name": "CreateAccount_ReturnsCorrectName",
  "async": false,

  "traits": { "category": ["smoke", "crm"] },
  "timeoutMs": 30000,
  "ignore": { "reason": "Flaky in CI" },

  "arrange": { "bindings": [] },
  "act": { "resultVar": "createdId", "operation": { } },
  "assert": { "retrievals": [], "assertions": [] },

  "extensions": { }
}
```

### 4.1 Semantics
- `framework` controls how the compiler emits test attributes and (optionally) surrounding class attributes.
- `kind` indicates a single test (`test`) or data-driven test (`theory`).  
  **v1.2 limitation:** only `xunit` supports `theory` compilation; MSTest/NUnit will produce diagnostics unless you define a data source extension.
- `async` controls whether the generated method is `async Task` or `void`.
- `traits`, `timeoutMs`, and `ignore` are normalized metadata and are mapped per framework.
- `extensions` can store unknown/unparsed elements without failing compilation.

---

## 5. Framework mapping

### 5.1 Method-level mapping
| DSL | xUnit | MSTest | NUnit |
|---|---|---|---|
| `kind = "test"` | `[Fact]` | `[TestMethod]` | `[Test]` |
| `kind = "theory"` | `[Theory]` | Not supported in v1.2 | Not supported in v1.2 |
| `ignore.reason` | `[Fact(Skip="...")]` or `[Theory(Skip="...")]` | `[Ignore("...")]` | `[Ignore("...")]` |
| `timeoutMs` | **Not built-in** (see 5.3) | `[Timeout(ms)]` | `[Timeout(ms)]` |
| `traits.category` | `[Trait("Category","x")]` | `[TestCategory("x")]` | `[Category("x")]` |

### 5.2 Class-level mapping (if generating a complete file/class)
If your compiler outputs the entire class, the recommended defaults are:

| Framework | Class attribute |
|---|---|
| xUnit | None required |
| MSTest | `[TestClass]` |
| NUnit | `[TestFixture]` (optional but conventional) |

> **Compiler option:** `emitClassShell: true|false`.  
> If `false`, only method code is emitted and class attributes are not generated.

### 5.3 Timeout in xUnit
xUnit does not have a built-in `[Timeout]` attribute like MSTest/NUnit.
**Policy options (choose one and keep consistent):**
1. **Ignore with diagnostic**: emit `UNSUPPORTED_TIMEOUT_XUNIT` and omit timeout.
2. **Emit comment**: `// Timeout requested (30000ms) but not enforced by xUnit by default.`
3. **Extension hook** (advanced): allow `extensions.xunitTimeoutStrategy` to configure a project-specific timeout mechanism.

Default for v1.2: **Option 1** (diagnostic) unless configured otherwise.

---

## 6. Arrange section

Arrange is an ordered list of **bindings**. Each binding produces a named variable.

```json
{
  "bindings": [ Binding ]
}
```

### 6.1 Binding

```json
{
  "id": "account",
  "var": "account",
  "kind": "producerDraft",
  "producer": {
    "call": "Producer.DraftValidAccount",
    "with": [
      { "path": "Name", "value": { "type": "string", "value": "Test" } }
    ]
  },
  "build": false,
  "expose": {
    "entityMember": "Entity",
    "entityReferenceCall": "ToEntityReference"
  }
}
```

#### Fields
- `id` *(required)*: unique identifier within the test. Default: same as `var` during decompile.
- `var` *(required)*: the variable name used in generated C#.
- `kind`: currently only `"producerDraft"` is supported.
- `producer.call` *(required)*: the producer method name string (e.g., `"Producer.DraftValidAccount"`).
- `producer.with`: ordered list of `.With(...)` mutations.
- `build`: whether `.Build()` is appended.
- `expose` *(optional)*: hints for compilation (defaults shown above).

### 6.2 With mutation

Represents `.With(x => x.Property = value)`.

```json
{
  "path": "CustomerTypeCode",
  "value": { "type": "enum", "enumType": "Account_CustomerTypeCode", "member": "Customer" }
}
```

Constraints (v1.2):
- `path` must be a simple identifier (no nested `A.B.C` paths).
- Mutation must be an assignment, not an expression statement.
- The lambda parameter name is compiler-chosen (e.g. `a`), not represented in DSL.

---

## 7. Value expressions

### 7.1 Supported literal forms

```json
{ "type": "string", "value": "text" }
{ "type": "number", "value": 123 }
{ "type": "boolean", "value": true }
{ "type": "guid", "value": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" }
{ "type": "null" }
```

### 7.2 Enum literals (**NEW in v1.2**)

To support:
```csharp
.With(a => a.CustomerTypeCode = Account_CustomerTypeCode.Customer);
```

Use:

```json
{
  "type": "enum",
  "enumType": "Account_CustomerTypeCode",
  "member": "Customer"
}
```

#### Compilation rule
- Emits: `Account_CustomerTypeCode.Customer`

#### Decompilation rule
- When RHS is a `MemberAccessExpression` (or fully-qualified member access) and the symbol resolves to an enum member,
  capture `enumType` and `member`.

#### Optional underlying value (rare)
If your codebase assigns numeric enum values directly (not recommended), allow:

```json
{ "type": "enumNumber", "enumType": "Account_CustomerTypeCode", "value": 123 }
```

Compiler emits:
- `(Account_CustomerTypeCode)123`

Decompiler may produce `enumNumber` if it cannot map the numeric value to a specific member.

### 7.3 Interpolation

```json
{
  "type": "interpolation",
  "template": "${account.Entity.Name} | ${account.Entity.CustomerTypeCode}"
}
```

Compiles to:

```csharp
$"{account.Entity.Name} | {account.Entity.CustomerTypeCode}"
```

### 7.4 References

```json
{
  "type": "ref",
  "ref": { "kind": "bindingVar", "id": "contact", "call": "ToEntityReference" }
}
```

#### RefExpr forms
```json
{ "kind": "bindingVar", "id": "contact", "member": "Entity" }
{ "kind": "bindingVar", "id": "contact", "call": "ToEntityReference" }
{ "kind": "actResult" }
```

---

## 8. Act section

Act must contain **exactly one** `AdminDao` operation.

```json
{
  "resultVar": "createdAccountId",
  "operation": { "kind": "create", "...": "see below" }
}
```

### 8.1 Supported operations (normalized)

#### 8.1.1 Create
```json
{
  "kind": "create",
  "genericType": "Account",
  "entity": { "fromBinding": "account", "member": "Entity" },
  "awaited": false
}
```

#### 8.1.2 Update
```json
{
  "kind": "update",
  "genericType": "Account",
  "entity": { "fromBinding": "account", "member": "Entity" },
  "awaited": true
}
```

#### 8.1.3 Delete
```json
{
  "kind": "delete",
  "genericType": "Account",
  "id": { "type": "guid", "value": "..." },
  "awaited": true
}
```

#### 8.1.4 Associate
```json
{
  "kind": "associate",
  "relationshipName": "account_primary_contact",
  "genericType": null,
  "target": {
    "type": "ref",
    "ref": { "kind": "bindingVar", "id": "account", "call": "ToEntityReference" }
  },
  "related": {
    "kind": "single",
    "value": {
      "type": "ref",
      "ref": { "kind": "bindingVar", "id": "contact", "call": "ToEntityReference" }
    }
  },
  "awaited": true,
  "unawaitedVariant": false
}
```

#### 8.1.5 Disassociate
Same schema as `associate` but with `"kind": "disassociate"` and `related` constrained to `single` in v1.2.

### 8.2 Relationship overload selection
Your interface includes multiple overloads (string relationship name, generic `<T>`, awaited/unawaited, single/many).  
The DSL normalizes intent into:
- `relationshipName` **or** `genericType`
- `related.kind`: `single | many`
- `awaited`: controls `await`
- `unawaitedVariant`: whether to use the explicit `Unawaited` method names

**Compiler policy:**
- If `unawaitedVariant=true`, use `*UnawaitedAsync*` variants (per your interface).
- Else use awaited `*Async*` variants if `awaited=true`.
- If `awaited=false`, use the sync-style method set if present in your codebase; otherwise emit `await` + `Async` and require `"async": true`.

> If your actual codebase uses only sync `AdminDao.Create(...)` etc. (as in your examples), the compiler can operate in **sync mode**. This is an implementation option; the DSL supports either.

---

## 9. Assert section

Assert has two parts:
1. `retrievals`: bind data from CRM via `AdminDao.Retrieve*`
2. `assertions`: FluentAssertions subset over bound vars/members

```json
{
  "retrievals": [ Retrieval ],
  "assertions": [ Assertion ]
}
```

---

## 10. Retrieval nodes

```json
{
  "var": "retrievedAccount",
  "kind": "retrieveFirstOrDefault",
  "entitySet": "AccountSet",
  "alias": "a",
  "where": {
    "op": "eq",
    "left": { "kind": "member", "root": "alias", "path": ["Id"] },
    "right": { "type": "ref", "ref": { "kind": "actResult" } }
  },
  "select": null
}
```

### 10.1 Supported `kind`
- `retrieveFirstOrDefault`
- `retrieveFirst`
- `retrieveSingle`
- `retrieveList`

### 10.2 Supported LINQ shape (v1.2)
Only:
- `xrm => xrm.<EntitySet>.Where(<predicate>)`

No projections, no `Select`, no `First()` in the lambda, no joins.

### 10.3 Where expression

#### Equality
```json
{
  "op": "eq",
  "left": MemberExpr,
  "right": ValueExpr
}
```

#### And
```json
{
  "op": "and",
  "items": [ WhereExpr, WhereExpr ]
}
```

### 10.4 MemberExpr
```json
{
  "kind": "member",
  "root": "alias",
  "path": ["AccountId", "Id"]
}
```

Represents `c.AccountId.Id`.

---

## 11. Assertion nodes (FluentAssertions subset)

### 11.1 Supported assertion kinds
- `notNull` → `.Should().NotBeNull()`
- `be` → `.Should().Be(expected)`
- `containSingle` → `.Should().ContainSingle(predicate)`

### 11.2 Target expressions

```json
{ "kind": "var", "name": "retrievedAccount" }
```

```json
{ "kind": "member", "rootVar": "retrievedAccount", "path": ["Name"] }
```

### 11.3 Assertion schemas

#### NotBeNull
```json
{
  "kind": "notNull",
  "target": { "kind": "var", "name": "retrievedAccount" }
}
```

#### Be
```json
{
  "kind": "be",
  "target": { "kind": "member", "rootVar": "retrievedAccount", "path": ["Name"] },
  "expected": { "type": "string", "value": "Acme" }
}
```

#### ContainSingle
```json
{
  "kind": "containSingle",
  "target": { "kind": "var", "name": "retrievedContacts" },
  "predicate": {
    "alias": "c",
    "op": "eq",
    "left": { "path": ["FullName"] },
    "right": { "type": "string", "value": "John Doe" }
  }
}
```

### 11.4 Predicate expression
Restricted to:
- `alias.Prop == <literal|ref>`

```json
{
  "alias": "c",
  "op": "eq",
  "left": { "path": ["FullName"] },
  "right": { "type": "string", "value": "John Doe" }
}
```

---

## 12. Compilation requirements

### 12.1 Canonical output template
Generated method must follow:

```csharp
[TestAttribute]
public void TestName()
{
    // Arrange
    ...

    // Act
    ...

    // Assert
    ...
}
```

### 12.2 Formatting rules
- Indentation: 4 spaces
- Blank line between AAA sections
- Stable variable naming from `Binding.var` and `Act.resultVar`
- Wrap long lambdas (recommended) but keep semantics stable

### 12.3 Null-conditional policy
If assertions include:
- `notNull` on a variable, compiler may generate member asserts without `?.`.
Otherwise, compiler may emit null-conditional member access:
- `retrievedAccount?.Name.Should().Be(...)`

This is a **compiler policy**; both are valid.

---

## 13. Decompilation requirements

Decompiler must:
1. Detect framework from attributes/usings.
2. Identify AAA sections using:
   - Preferred: `// Arrange`, `// Act`, `// Assert`
   - Fallback heuristics:
     - Arrange: statements starting with `Producer.`
     - Act: first `AdminDao.*` that is not `Retrieve*`
     - Assert: subsequent `AdminDao.Retrieve*` and `.Should()` calls
3. Parse Arrange bindings:
   - `var x = Producer.Draft...().With(...).Build();`
4. Parse Act:
   - Exactly one supported AdminDao call
5. Parse retrieval:
   - `AdminDao.Retrieve*(xrm => xrm.Set.Where(...))`
6. Parse assertions:
   - `.Should().NotBeNull()`
   - `.Should().Be(...)`
   - `.Should().ContainSingle(...)`
7. For unsupported fragments, store in `extensions.unparsed` and emit diagnostics rather than failing.

---

## 14. Diagnostics

Both compiler and decompiler produce structured diagnostics:

```json
{
  "code": "UNSUPPORTED_ASSERTION",
  "message": "Only Be, NotBeNull, and ContainSingle are supported",
  "location": {
    "section": "assert",
    "hint": "retrievedAccount.Should().BeEquivalentTo(...)"
  }
}
```

### 14.1 Recommended diagnostic codes
- `UNSUPPORTED_ASSERTION`
- `UNSUPPORTED_LINQ_SHAPE`
- `MULTIPLE_ACT_CALLS`
- `MISSING_AAA_SECTIONS`
- `AMBIGUOUS_TEST_FRAMEWORK`
- `UNSUPPORTED_TIMEOUT_XUNIT`
- `UNKNOWN_OPERATION_KIND`
- `UNRESOLVED_REFERENCE`

---

## 15. Complete examples

### 15.1 Simple example (C# → DSL)

C#:
```csharp
[Fact]
public void CreateAccount_ReturnsCorrectName()
{
    // Arrange
    var account = Producer.DraftValidAccount();

    // Act
    var createdAccountId = AdminDao.Create(account.Entity);

    // Assert
    var retrievedAccount = AdminDao.RetrieveFirstOrDefault(
        xrm => xrm.AccountSet.Where(a => a.Id == createdAccountId));

    retrievedAccount.Should().NotBeNull();
    retrievedAccount?.Name.Should().Be($"{account.Entity.Name} | {account.Entity.CustomerTypeCode}");
}
```

DSL:
```json
{
  "dslVersion": "1.2",
  "language": "csharp-aaa",
  "test": {
    "framework": "xunit",
    "kind": "test",
    "name": "CreateAccount_ReturnsCorrectName",
    "async": false,
    "arrange": {
      "bindings": [
        {
          "id": "account",
          "var": "account",
          "kind": "producerDraft",
          "producer": { "call": "Producer.DraftValidAccount", "with": [] },
          "build": false
        }
      ]
    },
    "act": {
      "resultVar": "createdAccountId",
      "operation": {
        "kind": "create",
        "genericType": "Account",
        "entity": { "fromBinding": "account", "member": "Entity" },
        "awaited": false
      }
    },
    "assert": {
      "retrievals": [
        {
          "var": "retrievedAccount",
          "kind": "retrieveFirstOrDefault",
          "entitySet": "AccountSet",
          "alias": "a",
          "where": {
            "op": "eq",
            "left": { "kind": "member", "root": "alias", "path": ["Id"] },
            "right": { "type": "ref", "ref": { "kind": "actResult" } }
          },
          "select": null
        }
      ],
      "assertions": [
        { "kind": "notNull", "target": { "kind": "var", "name": "retrievedAccount" } },
        {
          "kind": "be",
          "target": { "kind": "member", "rootVar": "retrievedAccount", "path": ["Name"] },
          "expected": {
            "type": "interpolation",
            "template": "${account.Entity.Name} | ${account.Entity.CustomerTypeCode}"
          }
        }
      ]
    }
  }
}
```

### 15.2 Enum in `.With(...)`

C#:
```csharp
var account = Producer.DraftValidAccount()
    .With(a => a.CustomerTypeCode = Account_CustomerTypeCode.Customer);
```

DSL:
```json
{
  "id": "account",
  "var": "account",
  "kind": "producerDraft",
  "producer": {
    "call": "Producer.DraftValidAccount",
    "with": [
      {
        "path": "CustomerTypeCode",
        "value": { "type": "enum", "enumType": "Account_CustomerTypeCode", "member": "Customer" }
      }
    ]
  },
  "build": false
}
```

---

## 16. Versioning and compatibility

- `dslVersion` must always be present.
- Backward incompatible changes increment major version.
- New optional fields increment minor version.
- Parsers should ignore unknown fields (forward compatibility) and store them in `extensions` if desired.

---

# End of Specification
