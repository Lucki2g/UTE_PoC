using CliWrap;
using CliWrap.Buffered;
using System.Xml.Linq;
using TestEngine.Models.Responses;

namespace TestEngine.Services;

public class TestRunnerService : ITestRunnerService
{
    private readonly string _repositoryPath;
    private readonly string _testProjectPath;

    public TestRunnerService(TestProjectPaths paths)
    {
        _repositoryPath = paths.RepositoryPath;
        _testProjectPath = paths.TestProjectPath;
    }

    public async Task<TestRunResult> RunTestAsync(string testName)
    {
        if (string.IsNullOrWhiteSpace(testName))
        {
            throw new ArgumentException("Test name cannot be empty", nameof(testName));
        }

        var resultsFile = Path.Combine(Path.GetTempPath(), $"testresults_{Guid.NewGuid()}.trx");

        try
        {
            // Run the specific test
            var result = await Cli.Wrap("dotnet")
                .WithArguments([
                    "test",
                    "--filter", $"FullyQualifiedName~{testName}",
                    "--logger", $"trx;LogFileName={resultsFile}"
                ])
                .WithWorkingDirectory(_testProjectPath)
                .WithValidation(CommandResultValidation.None)
                .ExecuteBufferedAsync();

            var parsed = ParseTrxResult(resultsFile, result.StandardOutput + result.StandardError);
            parsed.TestName = testName;
            return parsed;
        }
        catch (Exception e)
        {
            throw new FileNotFoundException($"Failed to build or run testcase at {_testProjectPath}/{testName}");
        }
        finally
        {
            if (File.Exists(resultsFile))
            {
                File.Delete(resultsFile);
            }
        }
    }

    public async Task<TestRunAllResult> RunAllTestsAsync()
    {
        var resultsFile = Path.Combine(Path.GetTempPath(), $"testresults_{Guid.NewGuid()}.trx");

        try
        {
            // Build the project first
            await Cli.Wrap("dotnet")
                .WithArguments(["build", "--no-incremental"])
                .WithWorkingDirectory(_testProjectPath)
                .ExecuteAsync();

            // Run all tests
            var result = await Cli.Wrap("dotnet")
                .WithArguments([
                    "test",
                    "--no-build",
                    "--logger", $"trx;LogFileName={resultsFile}"
                ])
                .WithWorkingDirectory(_testProjectPath)
                .WithValidation(CommandResultValidation.None)
                .ExecuteBufferedAsync();

            return ParseTrxAllResults(resultsFile, result.StandardOutput + result.StandardError);
        }
        finally
        {
            if (File.Exists(resultsFile))
            {
                File.Delete(resultsFile);
            }
        }
    }

    private TestRunResult ParseTrxResult(string trxFilePath, string consoleOutput)
    {
        if (!File.Exists(trxFilePath))
        {
            return new TestRunResult
            {
                Passed = false,
                Duration = "0s",
                Trace = consoleOutput,
                ErrorMessage = "Test results file not found"
            };
        }

        var doc = XDocument.Load(trxFilePath);
        var ns = doc.Root?.GetDefaultNamespace() ?? XNamespace.None;

        var unitTestResult = doc.Descendants(ns + "UnitTestResult").FirstOrDefault();
        if (unitTestResult == null)
        {
            return new TestRunResult
            {
                Passed = false,
                Duration = "0s",
                Trace = consoleOutput,
                ErrorMessage = "No test result found"
            };
        }

        var outcome = unitTestResult.Attribute("outcome")?.Value ?? "Failed";
        var duration = unitTestResult.Attribute("duration")?.Value ?? "0s";
        var errorMessage = unitTestResult.Descendants(ns + "Message").FirstOrDefault()?.Value;
        var stackTrace = unitTestResult.Descendants(ns + "StackTrace").FirstOrDefault()?.Value;

        return new TestRunResult
        {
            Passed = outcome.Equals("Passed", StringComparison.OrdinalIgnoreCase),
            Duration = duration,
            Trace = stackTrace ?? consoleOutput,
            ErrorMessage = errorMessage
        };
    }

    private TestRunAllResult ParseTrxAllResults(string trxFilePath, string consoleOutput)
    {
        var result = new TestRunAllResult
        {
            Total = 0,
            Passed = 0,
            Failed = 0,
            Results = new List<TestRunResult>()
        };

        if (!File.Exists(trxFilePath))
        {
            return result;
        }

        var doc = XDocument.Load(trxFilePath);
        var ns = doc.Root?.GetDefaultNamespace() ?? XNamespace.None;

        var unitTestResults = doc.Descendants(ns + "UnitTestResult").ToList();
        result.Total = unitTestResults.Count;

        foreach (var unitTestResult in unitTestResults)
        {
            var outcome = unitTestResult.Attribute("outcome")?.Value ?? "Failed";
            var duration = unitTestResult.Attribute("duration")?.Value ?? "0s";
            var testName = unitTestResult.Attribute("testName")?.Value ?? "Unknown";
            var errorMessage = unitTestResult.Descendants(ns + "Message").FirstOrDefault()?.Value;
            var stackTrace = unitTestResult.Descendants(ns + "StackTrace").FirstOrDefault()?.Value;

            var passed = outcome.Equals("Passed", StringComparison.OrdinalIgnoreCase);
            if (passed)
            {
                result.Passed++;
            }
            else
            {
                result.Failed++;
            }

            result.Results.Add(new TestRunResult
            {
                TestName = testName,
                Passed = passed,
                Duration = duration,
                Trace = stackTrace,
                ErrorMessage = errorMessage
            });
        }

        return result;
    }
}
