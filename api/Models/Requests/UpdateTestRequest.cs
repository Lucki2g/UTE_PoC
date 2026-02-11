using TestEngine.Models.Dsl;

namespace TestEngine.Models.Requests;

public class UpdateTestRequest
{
    public required string ClassName { get; set; }
    public required DslTestDefinition Code { get; set; }
}
