using TestEngine.Models.Dsl;
using TestEngine.Models.Responses;

namespace TestEngine.Services;

public class DataExtensionsService : IDataExtensionsService
{
    private readonly string _dataExtensionsPath;
    private readonly IFileManagerService _fileManager;

    public DataExtensionsService(TestProjectPaths paths, IFileManagerService fileManager)
    {
        _dataExtensionsPath = paths.DataExtensionsPath;
        _fileManager = fileManager;
    }

    public async Task<IEnumerable<ExtensionMetadata>> GetAllExtensionsAsync()
    {
        // TODO: Scan data extensions directory, parse files, return metadata with DSL
        throw new NotImplementedException("Get all extensions with DSL not yet implemented");
    }

    public async Task CreateExtensionAsync(DslExtensionDefinition dsl)
    {
        // TODO: Compile DSL to C# and create DataExtensions.<EntityName>.cs file
        throw new NotImplementedException("Create extension from DSL not yet implemented");
    }

    public async Task UpdateExtensionAsync(string entityName, DslExtensionDefinition dsl)
    {
        // TODO: Parse existing file with Roslyn, apply updates from DSL
        throw new NotImplementedException("Update extension from DSL not yet implemented");
    }

    public async Task DeleteExtensionAsync(string entityName)
    {
        if (string.IsNullOrWhiteSpace(entityName))
        {
            throw new ArgumentException("Entity name cannot be empty", nameof(entityName));
        }

        var filePath = Path.Combine(_dataExtensionsPath, $"DataExtensions.{entityName}.cs");
        if (!File.Exists(filePath))
        {
            throw new FileNotFoundException($"Data extension file for entity '{entityName}' not found");
        }

        File.Delete(filePath);
    }
}
