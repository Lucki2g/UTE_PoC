namespace TestEngine.Services;

public interface IMetadataService
{
    Task SyncMetadataAsync(string? environmentUrl = null);
}
