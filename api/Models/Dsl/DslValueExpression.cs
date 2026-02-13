using System.Text.Json;
using System.Text.Json.Serialization;

namespace TestEngine.Models.Dsl;

[JsonConverter(typeof(DslValueExpressionConverter))]
public abstract class DslValueExpression
{
    [JsonPropertyName("type")]
    public abstract string Type { get; }
}

public class DslStringValue : DslValueExpression
{
    public override string Type => "string";

    [JsonPropertyName("value")]
    public required string Value { get; set; }
}

public class DslNumberValue : DslValueExpression
{
    public override string Type => "number";

    [JsonPropertyName("value")]
    public required double Value { get; set; }
}

public class DslBooleanValue : DslValueExpression
{
    public override string Type => "boolean";

    [JsonPropertyName("value")]
    public required bool Value { get; set; }
}

public class DslGuidValue : DslValueExpression
{
    public override string Type => "guid";

    [JsonPropertyName("value")]
    public required string Value { get; set; }
}

public class DslNullValue : DslValueExpression
{
    public override string Type => "null";
}

public class DslEnumValue : DslValueExpression
{
    public override string Type => "enum";

    [JsonPropertyName("enumType")]
    public required string EnumType { get; set; }

    [JsonPropertyName("member")]
    public required string Member { get; set; }
}

public class DslEnumNumberValue : DslValueExpression
{
    public override string Type => "enumNumber";

    [JsonPropertyName("enumType")]
    public required string EnumType { get; set; }

    [JsonPropertyName("value")]
    public required int Value { get; set; }
}

public class DslInterpolationValue : DslValueExpression
{
    public override string Type => "interpolation";

    [JsonPropertyName("template")]
    public required string Template { get; set; }
}

public class DslRefValue : DslValueExpression
{
    public override string Type => "ref";

    [JsonPropertyName("ref")]
    public required DslRefExpr Ref { get; set; }
}

public class DslRefExpr
{
    [JsonPropertyName("kind")]
    public required string Kind { get; set; }

    [JsonPropertyName("id")]
    public string? Id { get; set; }

    [JsonPropertyName("member")]
    public string? Member { get; set; }

    [JsonPropertyName("call")]
    public string? Call { get; set; }
}

public class DslValueExpressionConverter : JsonConverter<DslValueExpression>
{
    public override DslValueExpression? Read(ref Utf8JsonReader reader, Type typeToConvert, JsonSerializerOptions options)
    {
        using var doc = JsonDocument.ParseValue(ref reader);
        var root = doc.RootElement;

        if (!root.TryGetProperty("type", out var typeProp))
            throw new JsonException("DslValueExpression must have a 'type' property.");

        var type = typeProp.GetString();
        var raw = root.GetRawText();

        return type switch
        {
            "string" => JsonSerializer.Deserialize<DslStringValue>(raw, Converterless(options)),
            "number" => JsonSerializer.Deserialize<DslNumberValue>(raw, Converterless(options)),
            "boolean" => JsonSerializer.Deserialize<DslBooleanValue>(raw, Converterless(options)),
            "guid" => JsonSerializer.Deserialize<DslGuidValue>(raw, Converterless(options)),
            "null" => JsonSerializer.Deserialize<DslNullValue>(raw, Converterless(options)),
            "enum" => JsonSerializer.Deserialize<DslEnumValue>(raw, Converterless(options)),
            "enumNumber" => JsonSerializer.Deserialize<DslEnumNumberValue>(raw, Converterless(options)),
            "interpolation" => JsonSerializer.Deserialize<DslInterpolationValue>(raw, Converterless(options)),
            "ref" => JsonSerializer.Deserialize<DslRefValue>(raw, Converterless(options)),
            _ => throw new JsonException($"Unknown DslValueExpression type: '{type}'")
        };
    }

    public override void Write(Utf8JsonWriter writer, DslValueExpression value, JsonSerializerOptions options)
    {
        var opts = Converterless(options);
        JsonSerializer.Serialize(writer, value, value.GetType(), opts);
    }

    private static JsonSerializerOptions Converterless(JsonSerializerOptions source)
    {
        var opts = new JsonSerializerOptions(source);
        opts.Converters.Clear();
        // Re-add any converters that aren't this one
        foreach (var converter in source.Converters)
        {
            if (converter is not DslValueExpressionConverter)
                opts.Converters.Add(converter);
        }
        return opts;
    }
}
