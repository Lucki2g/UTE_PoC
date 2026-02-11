using TestEngine.Models.Dsl;

namespace TestEngine.Models.Requests;

public class CreateProducerRequest
{
    public required DslProducerDefinition Code { get; set; }
}
