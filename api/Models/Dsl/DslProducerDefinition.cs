using System.Text.Json.Serialization;

namespace TestEngine.Models.Dsl;

/// <summary>
/// JSON DSL model for data producer definitions.
/// </summary>
public class DslProducerDefinition
{
    [JsonPropertyName("draft")]
    public DslDraft? Draft { get; set; }
}

public class DslDraft
{
    [JsonPropertyName("entity")]
    public string? Entity { get; set; }

    [JsonPropertyName("useExisting")]
    public bool UseExisting { get; set; }

    [JsonPropertyName("ensure")]
    public List<DslEnsureField>? Ensure { get; set; }
}

public class DslEnsureField
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
