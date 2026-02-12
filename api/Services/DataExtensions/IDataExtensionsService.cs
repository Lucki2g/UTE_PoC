using TestEngine.Models.Dsl;
using TestEngine.Models.Responses;

namespace TestEngine.Services;

public interface IDataExtensionsService
{
    Task<IEnumerable<ExtensionMetadata>> GetAllExtensionsAsync();
    Task CreateExtensionAsync(DslExtensionDefinition dsl);
    Task UpdateExtensionAsync(string entityName, DslExtensionDefinition dsl);
    Task DeleteExtensionAsync(string entityName);
}
