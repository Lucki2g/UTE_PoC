using TestEngine.Models.Dsl;
using TestEngine.Models.Responses;

namespace TestEngine.Services;

public interface IDataProducerService
{
    Task<IEnumerable<ProducerMetadata>> GetAllProducersAsync();
    Task CreateProducerAsync(DslProducerDefinition dsl);
    Task UpdateProducerAsync(string entityName, DslProducerDefinition dsl);
}
