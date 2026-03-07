namespace TestEngine.Services;

public interface IMetadataService
{
    Task SyncMetadataAsync(string? environmentUrl = null);
    IAsyncEnumerable<SyncProgressEvent> SyncMetadataStreamAsync(string? environmentUrl = null, CancellationToken cancellationToken = default);
}
