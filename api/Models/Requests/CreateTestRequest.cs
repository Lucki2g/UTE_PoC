using TestEngine.Models.Dsl;

namespace TestEngine.Models.Requests;

public class CreateTestRequest
{
    public required DslTestDefinition Code { get; set; }
    public string? ClassName { get; set; }
    public string? Folder { get; set; }
}
