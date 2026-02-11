using System.Text.Json.Serialization;

namespace TestEngine.Models.Dsl;

/// <summary>
/// JSON DSL model for test definitions.
/// TODO: Full DSL schema to be defined in a separate feature specification.
/// </summary>
public class DslTestDefinition
{
    [JsonPropertyName("className")]
    public string? ClassName { get; set; }

    [JsonPropertyName("namespace")]
    public string? Namespace { get; set; }

    [JsonPropertyName("methods")]
    public List<DslTestMethod>? Methods { get; set; }
}

public class DslTestMethod
{
    [JsonPropertyName("name")]
    public string? Name { get; set; }

    [JsonPropertyName("arrange")]
    public List<DslArrangeStep>? Arrange { get; set; }

    [JsonPropertyName("act")]
    public DslActStep? Act { get; set; }

    [JsonPropertyName("assert")]
    public List<DslAssertStep>? Assert { get; set; }
}

public class DslArrangeStep
{
    [JsonPropertyName("type")]
    public string? Type { get; set; }

    [JsonPropertyName("entity")]
    public string? Entity { get; set; }

    [JsonPropertyName("variable")]
    public string? Variable { get; set; }

    [JsonPropertyName("extensions")]
    public List<string>? Extensions { get; set; }
}

public class DslActStep
{
    [JsonPropertyName("type")]
    public string? Type { get; set; }

    [JsonPropertyName("action")]
    public string? Action { get; set; }

    [JsonPropertyName("target")]
    public string? Target { get; set; }
}

public class DslAssertStep
{
    [JsonPropertyName("type")]
    public string? Type { get; set; }

    [JsonPropertyName("expected")]
    public object? Expected { get; set; }

    [JsonPropertyName("actual")]
    public string? Actual { get; set; }
}
