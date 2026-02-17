using TestEngine.Models.Dsl;
using TestEngine.Models.Responses;

namespace TestEngine.Services;

public interface ITestService
{
    Task<IEnumerable<TestMetadata>> GetAllTestsAsync();
    Task CreateTestAsync(DslTestDefinition dsl, string? className = null, string? folder = null);
    Task UpdateTestAsync(string className, DslTestDefinition dsl);
    Task DeleteTestAsync(string className);
}
