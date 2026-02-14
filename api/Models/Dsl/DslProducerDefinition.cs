using System.Text.Json;
using System.Text.Json.Serialization;

namespace TestEngine.Models.Dsl;

/// <summary>
/// JSON DSL model for DataProducer definitions (spec v1.0).
/// Top-level container holding all draft definitions for a producer file.
/// </summary>
public class DslProducerDefinition
{
    [JsonPropertyName("dslVersion")]
    public string DslVersion { get; set; } = "1.0";

    [JsonPropertyName("producer")]
    public string Producer { get; set; } = "DataProducer";

    [JsonPropertyName("drafts")]
    public List<DslDraftDefinition> Drafts { get; set; } = [];
}

/// <summary>
/// A single Draft method definition.
/// </summary>
public class DslDraftDefinition
{
    [JsonPropertyName("id")]
    public required string Id { get; set; }

    [JsonPropertyName("entity")]
    public required DslDraftEntity Entity { get; set; }

    [JsonPropertyName("accessModifier")]
    public string AccessModifier { get; set; } = "internal";

    [JsonPropertyName("rules")]
    public List<DslDraftRule> Rules { get; set; } = [];
}

public class DslDraftEntity
{
    [JsonPropertyName("logicalName")]
    public required string LogicalName { get; set; }

    [JsonPropertyName("type")]
    public string Type { get; set; } = "entity";
}

/// <summary>
/// A single EnsureValue rule within a draft.
/// </summary>
public class DslDraftRule
{
    [JsonPropertyName("type")]
    public string Type { get; set; } = "ensure";

    [JsonPropertyName("attribute")]
    public required string Attribute { get; set; }

    [JsonPropertyName("value")]
    public required DslDraftValue Value { get; set; }
}

/// <summary>
/// Polymorphic value for a draft rule. Discriminated by "kind".
/// </summary>
[JsonConverter(typeof(DslDraftValueConverter))]
public abstract class DslDraftValue
{
    [JsonPropertyName("kind")]
    public abstract string Kind { get; }
}

public class DslDraftConstantValue : DslDraftValue
{
    public override string Kind => "constant";

    [JsonPropertyName("type")]
    public required string ValueType { get; set; }

    [JsonPropertyName("value")]
    public required object Value { get; set; }
}

public class DslDraftEnumValue : DslDraftValue
{
    public override string Kind => "enum";

    [JsonPropertyName("enumType")]
    public required string EnumType { get; set; }

    [JsonPropertyName("value")]
    public required string Value { get; set; }
}

public class DslDraftReferenceValue : DslDraftValue
{
    public override string Kind => "reference";

    [JsonPropertyName("draft")]
    public required string Draft { get; set; }

    [JsonPropertyName("self")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingDefault)]
    public bool Self { get; set; }

    [JsonPropertyName("build")]
    public bool Build { get; set; } = true;

    [JsonPropertyName("transform")]
    public string? Transform { get; set; }
}

/// <summary>
/// JSON converter for DslDraftValue polymorphic deserialization.
/// </summary>
public class DslDraftValueConverter : JsonConverter<DslDraftValue>
{
    public override DslDraftValue? Read(ref Utf8JsonReader reader, Type typeToConvert, JsonSerializerOptions options)
    {
        using var doc = JsonDocument.ParseValue(ref reader);
        var root = doc.RootElement;

        if (!root.TryGetProperty("kind", out var kindProp))
            throw new JsonException("DslDraftValue must have a 'kind' property.");

        var kind = kindProp.GetString();
        var raw = root.GetRawText();
        var opts = ConverterlessOptions(options);

        return kind switch
        {
            "constant" => JsonSerializer.Deserialize<DslDraftConstantValue>(raw, opts),
            "enum" => JsonSerializer.Deserialize<DslDraftEnumValue>(raw, opts),
            "reference" => JsonSerializer.Deserialize<DslDraftReferenceValue>(raw, opts),
            _ => throw new JsonException($"Unknown DslDraftValue kind: '{kind}'")
        };
    }

    public override void Write(Utf8JsonWriter writer, DslDraftValue value, JsonSerializerOptions options)
    {
        var opts = ConverterlessOptions(options);
        JsonSerializer.Serialize(writer, value, value.GetType(), opts);
    }

    private static JsonSerializerOptions ConverterlessOptions(JsonSerializerOptions source)
    {
        var opts = new JsonSerializerOptions(source);
        opts.Converters.Clear();
        foreach (var converter in source.Converters)
        {
            if (converter is not DslDraftValueConverter)
                opts.Converters.Add(converter);
        }
        return opts;
    }
}
