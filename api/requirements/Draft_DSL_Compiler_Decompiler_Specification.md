# DSL Compiler/Decompiler Specification

## C# DataProducer Draft Methods → JSON DSL

Version: 1.0

------------------------------------------------------------------------

# 1. Purpose

This specification defines a bidirectional transformation between:

-   C# partial classes containing Draft factory methods
-   A JSON-based DSL representation suitable for graphical frontend
    editing

The transformation must support full round-trip capability:

C# → DSL → C# (semantic equivalence) DSL → C# → DSL (structural
equivalence)

------------------------------------------------------------------------

# 2. Scope

The compiler processes methods inside:

    public partial class DataProducer

A method qualifies as a Draft Definition if:

-   Return type is Draft`<T>`{=html}
-   First statement initializes the entity if null: param ??= new T();
-   The method returns: new Draft`<T>`{=html}(this, param);

------------------------------------------------------------------------

# 3. DSL Top-Level Structure

``` json
{
  "dslVersion": "1.0",
  "producer": "DataProducer",
  "drafts": []
}
```

------------------------------------------------------------------------

# 4. Draft Definition Schema

``` json
{
  "id": "DraftValidSkill",
  "entity": {
    "logicalName": "ape_skill",
    "type": "entity"
  },
  "accessModifier": "internal",
  "rules": []
}
```

Fields:

-   id: Method name
-   entity.logicalName: Generic type argument from Draft`<T>`{=html}
-   accessModifier: Extracted method visibility
-   rules: Array of EnsureValue rules

------------------------------------------------------------------------

# 5. Rule Types

## 5.1 Constant Value

C#:

    skill.EnsureValue(a => a.ape_Name, "Plugins");

DSL:

``` json
{
  "type": "ensure",
  "attribute": "ape_Name",
  "value": {
    "kind": "constant",
    "type": "string",
    "value": "Plugins"
  }
}
```

------------------------------------------------------------------------

## 5.2 Enum Value

C#:

    skill.EnsureValue(a => a.ape_category, ape_skillcategory.ProCode);

DSL:

``` json
{
  "type": "ensure",
  "attribute": "ape_category",
  "value": {
    "kind": "enum",
    "enumType": "ape_skillcategory",
    "value": "ProCode"
  }
}
```

------------------------------------------------------------------------

## 5.3 Reference to Another Draft

C#:

    skill.EnsureValue(
        a => a.ape_skillid,
        () => DraftValidSkill(null).Build().ToEntityReference()
    );

DSL:

``` json
{
  "type": "ensure",
  "attribute": "ape_skillid",
  "value": {
    "kind": "reference",
    "draft": "DraftValidSkill",
    "build": true,
    "transform": "ToEntityReference"
  }
}
```

------------------------------------------------------------------------

## 5.4 Self Reference

``` json
{
  "type": "ensure",
  "attribute": "ape_developerid",
  "value": {
    "kind": "reference",
    "draft": "DraftValidDeveloperSkill",
    "self": true,
    "build": true,
    "transform": "ToEntityReference"
  }
}
```

------------------------------------------------------------------------

# 6. Compiler Rules (C# → DSL)

For each Draft method:

1.  Extract method name → id
2.  Extract generic type → entity.logicalName
3.  Extract access modifier
4.  Identify null-coalescing instantiation
5.  Parse each EnsureValue call
6.  Detect value type:
    -   String / numeric literal → constant
    -   Enum member → enum
    -   Lambda invoking another draft → reference
7.  Emit structured JSON rule

------------------------------------------------------------------------

# 7. Decompiler Rules (DSL → C#)

For each draft definition:

## 7.1 Method Signature

    internal Draft<{entity}> {id}({entity}? skill = null)

## 7.2 Instantiate if null

    skill ??= new {entity}();

## 7.3 Generate EnsureValue

Constant:

    skill.EnsureValue(a => a.{attribute}, "value");

Enum:

    skill.EnsureValue(a => a.{attribute}, enumType.Value);

Reference:

    skill.EnsureValue(
        a => a.{attribute},
        () => {draft}(null).Build().ToEntityReference()
    );

## 7.4 Return

    return new Draft<{entity}>(this, skill);

------------------------------------------------------------------------

# 8. Validation Rules

-   Draft ids must be unique
-   References must target existing draft ids
-   Self references must explicitly declare "self": true
-   Circular references allowed but must be detected for UI graph
    rendering
-   Enum values must match declared enum type

------------------------------------------------------------------------

# 9. Frontend Usage Model

The DSL supports:

-   Drag-and-drop draft composition
-   Enum dropdown selection
-   Reference linking between drafts
-   Graph visualization of dependencies
-   Validation before C# regeneration
-   Detection of circular/self dependencies

------------------------------------------------------------------------

# 10. Extensibility

Future extensions may include:

``` json
"conditions": [],
"validation": [],
"metadata": {},
"ui": {
  "color": "#4488FF",
  "group": "Developer"
}
```

------------------------------------------------------------------------

# 11. Round-Trip Guarantee

The compiler/decompiler must ensure:

-   Behavior equivalence
-   Stable structural representation
-   Deterministic generation
-   No semantic loss

Whitespace and formatting are not guaranteed to match original C#.

------------------------------------------------------------------------

End of Specification
