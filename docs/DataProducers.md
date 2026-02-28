# DataProducers & Draft

`DataProducer` is a test helper that creates and persists Dataverse entities for integration tests.
It exposes `Draft*` methods — lazy blueprints for entities that are only built and saved when `Build()` is called.

## Core concepts

| Concept | What it does |
|---|---|
| `Draft<T>` | A lazy blueprint for entity `T`. Nothing runs until `Build()`. |
| `With` | Sets a property unconditionally. |
| `WithDefault` | Sets a property only if the caller has not already set it. |
| `Build()` | Materialises the entity and persists it to Dataverse. Returns the entity with its ID. |
| `Ref()` | Wraps a draft factory in a `Lazy<T>` so a shared dependency is built at most once. |

---

## With

`With` always applies its mutation. Use it for required fields that define what the entity is.

```csharp
internal Draft<A> DraftValidA()
{
    return new Draft<A>(this)
        .With(a => a.Name = "Alice")
        .With(a => a.Status = Status.Active);
}
```

Calling `Build()` creates the entity in Dataverse:

```csharp
var a = producer.DraftValidA().Build();
```

---

## WithDefault

`WithDefault` only applies if the caller has not explicitly set that property.
The factory is **lazy** — it does not run if the property was already set.

```csharp
internal Draft<A> DraftValidA()
{
    return new Draft<A>(this)
        .With(a => a.Name = "Alice")
        .WithDefault(a => a.Bid, () => DraftValidB().Build().ToEntityReference());
}
```

A test that needs a specific `B` overrides the default with `With`:

```csharp
var b = producer.DraftValidB()
    .With(b => b.Name = "Custom B")
    .Build();

var a = producer.DraftValidA()
    .With(a => a.Bid = b.ToEntityReference())  // overrides the default
    .Build();
```

Because the default factory was overridden, `DraftValidB()` is never called for `a`.

### EntityReference shorthand

When a `WithDefault` default builds a draft and converts it to an `EntityReference`, the
draft factory can be passed directly — `.Build().ToEntityReference()` is applied automatically:

```csharp
// Verbose
.WithDefault(a => a.Bid, () => DraftValidB().Build().ToEntityReference())

// Shorthand — identical behaviour
.WithDefault(a => a.Bid, DraftValidB)
```

---

## Ref

Use `Ref` when **multiple properties depend on the same entity** and that entity should only be
built once. `Ref` wraps the draft factory in a `Lazy<T>`: the factory runs on first access and
the result is cached for all subsequent accesses.

### Problem without Ref

```csharp
internal Draft<A> DraftValidA()
{
    return new Draft<A>(this)
        // DraftValidB() is called twice — two separate B entities are created
        .WithDefault(a => a.Bid, () => DraftValidB().Build().ToEntityReference())
        .WithDefault(a => a.Name, () => DraftValidB().Build().Name);
}
```

### Solution with Ref

Pass the draft method directly — `Ref` accepts a method group just like `WithDefault` does:

```csharp
internal Draft<A> DraftValidA()
{
    var b = Ref(DraftValidB);   // factory registered, not yet called

    return new Draft<A>(this)
        .WithDefault(a => a.Bid,  () => b.Value.ToEntityReference())
        .WithDefault(a => a.Name, () => b.Value.Name);
        // b.Value is only evaluated during Build(), and only if the property was not overridden
}
```

If both properties are overridden by the caller, `b.Value` is never accessed and `B` is never built.
If either property is evaluated, `B` is built exactly once.

---

## Composing drafts

Drafts compose naturally. A draft for `A` can declare a default that itself uses a draft for `B`,
which in turn declares a default that uses a draft for `C`.

```csharp
internal Draft<C> DraftValidC()
{
    return new Draft<C>(this)
        .With(c => c.Name = "C");
}

internal Draft<B> DraftValidB()
{
    return new Draft<B>(this)
        .With(b => b.Name = "B")
        .WithDefault(b => b.Cid, DraftValidC);  // shorthand
}

internal Draft<A> DraftValidA()
{
    return new Draft<A>(this)
        .With(a => a.Name = "A")
        .WithDefault(a => a.Bid, DraftValidB);  // shorthand
}
```

Building `A` creates the full chain — `C` first, then `B`, then `A` — only saving what is needed.
Overriding any dependency stops the chain from creating that entity:

```csharp
// Only B and A are created — C is never touched
var b = producer.DraftValidB()
    .With(b => b.Cid = existingC.ToEntityReference())
    .Build();

var a = producer.DraftValidA()
    .With(a => a.Bid = b.ToEntityReference())
    .Build();
```

---

## Adding a new DataProducer

1. Create a partial class file under `test/SharedTest/DataProducers/`.
2. Name the file `DataProducer.<EntityName>.cs`.
3. Follow the pattern:

```csharp
namespace SharedTest;

public partial class DataProducer
{
    internal Draft<A> DraftValidA()
    {
        return new Draft<A>(this)
            .With(a => a.Name = "default name")
            .WithDefault(a => a.Bid, DraftValidB);
    }
}
```

- Use `With` for fields that are intrinsic to the entity (its identity or required values).
- Use `WithDefault` for foreign-key dependencies so callers can supply their own.
- Use `Ref` when two or more `WithDefault` calls share the same dependency.
