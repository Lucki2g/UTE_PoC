using TestEngine.Models.Dsl;

namespace TestEngine.Models.Responses;

public class TestMetadata
{
    public required string ClassName { get; set; }
    public required string FilePath { get; set; }
    public required List<string> MethodNames { get; set; }
    public DateTime LastModified { get; set; }
    public DslTestDefinition? Dsl { get; set; }
}
