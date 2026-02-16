using System.Text.Json;
using System.Text.Json.Serialization;

namespace TestEngine.Models.Dsl;

/// <summary>
/// Top-level DSL envelope per v1.2 specification.
/// </summary>
public class DslTestDefinition
{
    [JsonPropertyName("dslVersion")]
    public string DslVersion { get; set; } = "1.2";

    [JsonPropertyName("language")]
    public string Language { get; set; } = "csharp-aaa";

    [JsonPropertyName("test")]
    public required DslTest Test { get; set; }
}

public class DslTest
{
    [JsonPropertyName("framework")]
    public required string Framework { get; set; }

    [JsonPropertyName("kind")]
    public string Kind { get; set; } = "test";

    [JsonPropertyName("name")]
    public required string Name { get; set; }

    [JsonPropertyName("async")]
    public bool Async { get; set; }

    [JsonPropertyName("traits")]
    public Dictionary<string, List<string>>? Traits { get; set; }

    [JsonPropertyName("timeoutMs")]
    public int? TimeoutMs { get; set; }

    [JsonPropertyName("ignore")]
    public DslIgnore? Ignore { get; set; }

    [JsonPropertyName("arrange")]
    public required DslArrange Arrange { get; set; }

    [JsonPropertyName("act")]
    public required DslAct Act { get; set; }

    [JsonPropertyName("assert")]
    public required DslAssert Assert { get; set; }

    [JsonPropertyName("extensions")]
    public JsonElement? Extensions { get; set; }
}

public class DslIgnore
{
    [JsonPropertyName("reason")]
    public required string Reason { get; set; }
}

// --- Arrange ---

public class DslArrange
{
    [JsonPropertyName("bindings")]
    public List<DslBinding> Bindings { get; set; } = [];
}

public class DslBinding
{
    [JsonPropertyName("id")]
    public required string Id { get; set; }

    [JsonPropertyName("var")]
    public required string Var { get; set; }

    [JsonPropertyName("kind")]
    public string Kind { get; set; } = "producerDraft";

    [JsonPropertyName("producer")]
    public required DslProducerCall Producer { get; set; }

    [JsonPropertyName("build")]
    public bool Build { get; set; }

    [JsonPropertyName("expose")]
    public DslExpose? Expose { get; set; }
}

public class DslProducerCall
{
    [JsonPropertyName("call")]
    public required string Call { get; set; }

    [JsonPropertyName("with")]
    public List<DslWithMutation> With { get; set; } = [];
}

public class DslWithMutation
{
    [JsonPropertyName("path")]
    public required string Path { get; set; }

    [JsonPropertyName("value")]
    public required DslValueExpression Value { get; set; }
}

public class DslExpose
{
    [JsonPropertyName("entityMember")]
    public string EntityMember { get; set; } = "Entity";

    [JsonPropertyName("entityReferenceCall")]
    public string EntityReferenceCall { get; set; } = "ToEntityReference";
}

// --- Act ---

public class DslAct
{
    [JsonPropertyName("resultVar")]
    public string? ResultVar { get; set; }

    [JsonPropertyName("operation")]
    public required DslOperation Operation { get; set; }
}

public class DslOperation
{
    [JsonPropertyName("kind")]
    public required string Kind { get; set; }

    [JsonPropertyName("genericType")]
    public string? GenericType { get; set; }

    [JsonPropertyName("entity")]
    public DslEntityRef? Entity { get; set; }

    [JsonPropertyName("id")]
    public DslValueExpression? Id { get; set; }

    [JsonPropertyName("awaited")]
    public bool Awaited { get; set; }

    [JsonPropertyName("relationshipName")]
    public string? RelationshipName { get; set; }

    [JsonPropertyName("target")]
    public DslValueExpression? Target { get; set; }

    [JsonPropertyName("related")]
    public DslRelated? Related { get; set; }

    [JsonPropertyName("unawaitedVariant")]
    public bool UnawaitedVariant { get; set; }
}

public class DslEntityRef
{
    [JsonPropertyName("fromBinding")]
    public required string FromBinding { get; set; }

    [JsonPropertyName("member")]
    public string Member { get; set; } = "Entity";
}

public class DslRelated
{
    [JsonPropertyName("kind")]
    public required string Kind { get; set; }

    [JsonPropertyName("value")]
    public required DslValueExpression Value { get; set; }
}

// --- Assert ---

public class DslAssert
{
    [JsonPropertyName("retrievals")]
    public List<DslRetrieval> Retrievals { get; set; } = [];

    [JsonPropertyName("assertions")]
    public List<DslAssertion> Assertions { get; set; } = [];
}

public class DslRetrieval
{
    [JsonPropertyName("var")]
    public required string Var { get; set; }

    [JsonPropertyName("kind")]
    public required string Kind { get; set; }

    [JsonPropertyName("entitySet")]
    public required string EntitySet { get; set; }

    [JsonPropertyName("alias")]
    public required string Alias { get; set; }

    [JsonPropertyName("where")]
    public DslWhereExpression? Where { get; set; }

    [JsonPropertyName("select")]
    public object? Select { get; set; }
}

[JsonConverter(typeof(DslWhereExpressionConverter))]
public class DslWhereExpression
{
    [JsonPropertyName("op")]
    public required string Op { get; set; }

    // For "eq" operator
    [JsonPropertyName("left")]
    public DslMemberExpr? Left { get; set; }

    [JsonPropertyName("right")]
    public DslValueExpression? Right { get; set; }

    // For "and" operator
    [JsonPropertyName("items")]
    public List<DslWhereExpression>? Items { get; set; }
}

public class DslWhereExpressionConverter : JsonConverter<DslWhereExpression>
{
    public override DslWhereExpression? Read(ref Utf8JsonReader reader, Type typeToConvert, JsonSerializerOptions options)
    {
        using var doc = JsonDocument.ParseValue(ref reader);
        var root = doc.RootElement;
        var raw = root.GetRawText();

        // Remove this converter to avoid recursion, deserialize manually
        var opts = new JsonSerializerOptions(options);
        opts.Converters.Clear();
        foreach (var c in options.Converters)
        {
            if (c is not DslWhereExpressionConverter)
                opts.Converters.Add(c);
        }

        // Need to keep the DslValueExpression converter
        if (!opts.Converters.Any(c => c is DslValueExpressionConverter))
            opts.Converters.Add(new DslValueExpressionConverter());

        var result = new DslWhereExpression
        {
            Op = root.GetProperty("op").GetString()!
        };

        if (root.TryGetProperty("left", out var leftEl))
            result.Left = JsonSerializer.Deserialize<DslMemberExpr>(leftEl.GetRawText(), opts);

        if (root.TryGetProperty("right", out var rightEl))
            result.Right = JsonSerializer.Deserialize<DslValueExpression>(rightEl.GetRawText(), opts);

        if (root.TryGetProperty("items", out var itemsEl))
        {
            result.Items = [];
            // Re-add this converter for recursive items
            var recursiveOpts = new JsonSerializerOptions(opts);
            recursiveOpts.Converters.Add(new DslWhereExpressionConverter());
            foreach (var item in itemsEl.EnumerateArray())
            {
                var child = JsonSerializer.Deserialize<DslWhereExpression>(item.GetRawText(), recursiveOpts);
                if (child != null) result.Items.Add(child);
            }
        }

        return result;
    }

    public override void Write(Utf8JsonWriter writer, DslWhereExpression value, JsonSerializerOptions options)
    {
        writer.WriteStartObject();
        writer.WriteString("op", value.Op);

        if (value.Left != null)
        {
            writer.WritePropertyName("left");
            JsonSerializer.Serialize(writer, value.Left, options);
        }

        if (value.Right != null)
        {
            writer.WritePropertyName("right");
            JsonSerializer.Serialize(writer, value.Right, options);
        }

        if (value.Items != null)
        {
            writer.WritePropertyName("items");
            writer.WriteStartArray();
            foreach (var item in value.Items)
                JsonSerializer.Serialize(writer, item, options);
            writer.WriteEndArray();
        }

        writer.WriteEndObject();
    }
}

public class DslMemberExpr
{
    [JsonPropertyName("kind")]
    public string Kind { get; set; } = "member";

    [JsonPropertyName("root")]
    public required string Root { get; set; }

    [JsonPropertyName("path")]
    public required List<string> Path { get; set; }
}

public class DslAssertion
{
    [JsonPropertyName("kind")]
    public required string Kind { get; set; }

    [JsonPropertyName("target")]
    public required DslAssertionTarget Target { get; set; }

    [JsonPropertyName("expected")]
    public DslValueExpression? Expected { get; set; }

    [JsonPropertyName("predicate")]
    public DslPredicate? Predicate { get; set; }
}

public class DslAssertionTarget
{
    [JsonPropertyName("kind")]
    public required string Kind { get; set; }

    [JsonPropertyName("name")]
    public string? Name { get; set; }

    [JsonPropertyName("rootVar")]
    public string? RootVar { get; set; }

    [JsonPropertyName("path")]
    public List<string>? Path { get; set; }
}

public class DslPredicate
{
    [JsonPropertyName("alias")]
    public required string Alias { get; set; }

    [JsonPropertyName("op")]
    public required string Op { get; set; }

    [JsonPropertyName("left")]
    public required DslPredicateLeft Left { get; set; }

    [JsonPropertyName("right")]
    public required DslValueExpression Right { get; set; }
}

public class DslPredicateLeft
{
    [JsonPropertyName("path")]
    public required List<string> Path { get; set; }
}
