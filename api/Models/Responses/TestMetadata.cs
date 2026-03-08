using System.Text.Json.Serialization;
using TestEngine.Models.Dsl;

namespace TestEngine.Models.Responses;

public class TestMetadata
{
    public required string ClassName { get; set; }
    public required string FilePath { get; set; }
    public required List<string> MethodNames { get; set; }
    public DateTime LastModified { get; set; }

    /// <summary>Per-method DSL definitions. Key = method name, value = decompiled DSL.</summary>
    [JsonPropertyName("methodDsls")]
    public Dictionary<string, DslTestDefinition>? MethodDsls { get; set; }

    /// <summary>Legacy: DSL for the first method only. Kept for backwards compatibility.</summary>
    [Obsolete("Use MethodDsls[methodName] instead.")]
    public DslTestDefinition? Dsl { get; set; }
}
