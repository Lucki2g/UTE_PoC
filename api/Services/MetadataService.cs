using CliWrap;

namespace TestEngine.Services;

public class MetadataService : IMetadataService
{
    private readonly string _repositoryPath;

    public MetadataService(IConfiguration configuration)
    {
        _repositoryPath = configuration["TestProject:RepositoryPath"]
            ?? throw new InvalidOperationException("TestProject:RepositoryPath not configured");
    }

    public async Task SyncMetadataAsync(string? environmentUrl = null)
    {
        // TODO: Run XrmContext to regenerate early-bound C# types
        // TODO: Run XrmMockup Metadata Generator
        // TODO: Run PAMU_CDS tooling for Power Automate flow definitions
        throw new NotImplementedException("Metadata sync not yet implemented. Requires XrmContext, XrmMockup Metadata Generator, and PAMU_CDS configuration.");
    }
}
