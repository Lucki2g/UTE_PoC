using System.Text.Json.Serialization;

namespace TestEngine.Models.Dsl;

/// <summary>
/// JSON DSL model for data extension definitions.
/// </summary>
public class DslExtensionDefinition
{
    [JsonPropertyName("entity")]
    public string? Entity { get; set; }

    [JsonPropertyName("methods")]
    public List<DslExtensionMethod>? Methods { get; set; }
}

public class DslExtensionMethod
{
    [JsonPropertyName("name")]
    public string? Name { get; set; }

    [JsonPropertyName("set")]
    public List<DslSetField>? Set { get; set; }
}

public class DslSetField
{
    [JsonPropertyName("field")]
    public string? Field { get; set; }

    [JsonPropertyName("value")]
    public DslFieldValue? Value { get; set; }
}

public class DslFieldValue
{
    [JsonPropertyName("enum")]
    public string? Enum { get; set; }

    [JsonPropertyName("gen")]
    public string? Gen { get; set; }

    [JsonPropertyName("literal")]
    public string? Literal { get; set; }
}
