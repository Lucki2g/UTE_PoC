using TestEngine.Models.Dsl;

namespace TestEngine.Models.Responses;

public class ProducerMetadata
{
    public required string EntityName { get; set; }
    public required string FilePath { get; set; }
    public required List<string> MethodNames { get; set; }
    public DslProducerDefinition? Dsl { get; set; }
}
