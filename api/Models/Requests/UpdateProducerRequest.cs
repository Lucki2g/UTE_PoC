using TestEngine.Models.Dsl;

namespace TestEngine.Models.Requests;

public class UpdateProducerRequest
{
    public required string EntityName { get; set; }
    public required DslProducerDefinition Code { get; set; }
}
