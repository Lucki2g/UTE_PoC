using System.Text.Json.Serialization;
using TestEngine.Models.Dsl;

namespace TestEngine.Models.Requests;

public class CreateTestRequest
{
    [JsonPropertyName("code")]
    public required DslTestDefinition Code { get; set; }

    [JsonPropertyName("className")]
    public string? ClassName { get; set; }

    [JsonPropertyName("folder")]
    public string? Folder { get; set; }
}
