using TestEngine.Models.Dsl;
using TestEngine.Models.Responses;

namespace TestEngine.Services;

public class DataProducerService : IDataProducerService
{
    private readonly string _dataProducersPath;
    private readonly IFileManagerService _fileManager;

    public DataProducerService(TestProjectPaths paths, IFileManagerService fileManager)
    {
        _dataProducersPath = paths.DataProducersPath;
        _fileManager = fileManager;
    }

    public async Task<IEnumerable<ProducerMetadata>> GetAllProducersAsync()
    {
        // TODO: Scan data producers directory, parse files, return metadata with DSL
        throw new NotImplementedException("Get all producers with DSL not yet implemented");
    }

    public async Task CreateProducerAsync(DslProducerDefinition dsl)
    {
        // TODO: Compile DSL to C# and create DataProducer.<EntityName>.cs file
        throw new NotImplementedException("Create producer from DSL not yet implemented");
    }

    public async Task UpdateProducerAsync(string entityName, DslProducerDefinition dsl)
    {
        // TODO: Parse existing file with Roslyn, apply updates from DSL
        throw new NotImplementedException("Update producer from DSL not yet implemented");
    }
}
