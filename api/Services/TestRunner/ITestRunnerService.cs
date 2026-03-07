using TestEngine.Models.Responses;

namespace TestEngine.Services;

public interface ITestRunnerService
{
    Task<TestRunResult> RunTestAsync(string testName);
    Task<TestRunAllResult> RunAllTestsAsync();
    Task<TestRunAllResult> RunSubsetAsync(string filter);
}
