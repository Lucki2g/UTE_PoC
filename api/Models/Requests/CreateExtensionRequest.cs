using TestEngine.Models.Dsl;

namespace TestEngine.Models.Requests;

public class CreateExtensionRequest
{
    public required DslExtensionDefinition Code { get; set; }
}
