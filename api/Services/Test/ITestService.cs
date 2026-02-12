using TestEngine.Models.Dsl;
using TestEngine.Models.Responses;

namespace TestEngine.Services;

public interface ITestService
{
    Task<IEnumerable<TestMetadata>> GetAllTestsAsync();
    Task CreateTestAsync(DslTestDefinition dsl);
    Task UpdateTestAsync(string className, DslTestDefinition dsl);
    Task DeleteTestAsync(string className);
}
