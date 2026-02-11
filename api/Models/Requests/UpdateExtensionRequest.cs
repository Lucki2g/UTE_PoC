using TestEngine.Models.Dsl;

namespace TestEngine.Models.Requests;

public class UpdateExtensionRequest
{
    public required string EntityName { get; set; }
    public required DslExtensionDefinition Code { get; set; }
}
