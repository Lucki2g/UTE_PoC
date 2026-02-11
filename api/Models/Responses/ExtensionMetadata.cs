using TestEngine.Models.Dsl;

namespace TestEngine.Models.Responses;

public class ExtensionMetadata
{
    public required string EntityName { get; set; }
    public required string FilePath { get; set; }
    public required List<ExtensionMethodInfo> Methods { get; set; }
    public DslExtensionDefinition? Dsl { get; set; }
}

public class ExtensionMethodInfo
{
    public required string Name { get; set; }
    public required string Signature { get; set; }
}
