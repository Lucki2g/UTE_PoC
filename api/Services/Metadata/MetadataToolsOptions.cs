namespace TestEngine.Services;

public class MetadataToolsOptions
{
    public string XrmContextPath { get; set; } = @"src\Tools\XrmContext\XrmContext.exe";
    public string XrmContextOutputPath { get; set; } = @"src\Shared\SharedContext";
    public string XrmContextNamespace { get; set; } = string.Empty;
    public string[] XrmContextExtraArguments { get; set; } = [];

    public string MetadataGeneratorPath { get; set; } = @"src\Tools\MetadataGenerator\MetadataGenerator365.exe";
    public string MetadataGeneratorOutputPath { get; set; } = @"test\SharedTest\MetadataGenerated";
    public string[] MetadataGeneratorExtraArguments { get; set; } = [];

    public string Solutions { get; set; } = string.Empty;
    public string Entities { get; set; } = string.Empty;
}
