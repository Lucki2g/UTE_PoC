using TestEngine.Models.Dsl;
using TestEngine.Models.Responses;

namespace TestEngine.Services;

public interface IDataProducerService
{
    Task<IEnumerable<ProducerMetadata>> GetAllProducersAsync();
    Task<ProducerMetadata?> GetProducerAsync(string entityName);
    Task CreateProducerAsync(DslProducerDefinition dsl);
    Task UpdateProducerAsync(string entityName, DslProducerDefinition dsl);
}
