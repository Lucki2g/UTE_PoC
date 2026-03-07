using CliWrap;
using CliWrap.Buffered;
using System.Text.RegularExpressions;
using System.Xml.Linq;
using TestEngine.Models.Responses;

namespace TestEngine.Services;

public class TestRunnerService : ITestRunnerService
{
    private readonly string _repositoryPath;
    private readonly string _testProjectPath;

    // Prevent concurrent dotnet test invocations — they share the same build output directory
    private static readonly SemaphoreSlim _runLock = new(1, 1);

    public TestRunnerService(TestProjectPaths paths)
    {
        _repositoryPath = paths.RepositoryPath;
        _testProjectPath = paths.TestProjectPath;
    }

    // Extra MSBuild properties appended to every dotnet-test invocation.
    // Suppresses common auto-generated-file warnings/errors that are not ours to fix.
    // Semicolons must be percent-encoded (%3B) when passed via the dotnet CLI to avoid
    // them being treated as argument separators by MSBuild argument parsing.
    private static readonly string[] _noWarnArgs =
    [
        "-p:TreatWarningsAsErrors=false",
    ];

    private static bool IsBuildError(string consoleOutput) =>
        consoleOutput.Contains("error CS") || consoleOutput.Contains("Build FAILED") ||
        consoleOutput.Contains("could not be found");

    public async Task<TestRunResult> RunTestAsync(string testName)
    {
        if (string.IsNullOrWhiteSpace(testName))
            throw new ArgumentException("Test name cannot be empty", nameof(testName));

        if (!await _runLock.WaitAsync(0))
        {
            return new TestRunResult
            {
                TestName = testName,
                Passed = false,
                Duration = "0s",
                BuildError = "Another test run is already in progress. Please wait for it to finish."
            };
        }

        var resultsFile = Path.Combine(Path.GetTempPath(), $"testresults_{Guid.NewGuid()}.trx");
        try
        {
            var result = await Cli.Wrap("dotnet")
                .WithArguments([
                    "test",
                    "--filter", $"FullyQualifiedName~{testName}",
                    "--logger", $"trx;LogFileName={resultsFile}",
                    .. _noWarnArgs,
                ])
                .WithWorkingDirectory(_testProjectPath)
                .WithValidation(CommandResultValidation.None)
                .ExecuteBufferedAsync();

            var consoleOutput = result.StandardOutput + result.StandardError;

            if (!File.Exists(resultsFile) && IsBuildError(consoleOutput))
            {
                return new TestRunResult
                {
                    TestName = testName,
                    Passed = false,
                    Duration = "0s",
                    BuildError = consoleOutput,
                };
            }

            var parsed = ParseTrxResult(resultsFile, consoleOutput);
            parsed.TestName = testName;
            return parsed;
        }
        finally
        {
            _runLock.Release();
            if (File.Exists(resultsFile)) File.Delete(resultsFile);
        }
    }

    public async Task<TestRunAllResult> RunAllTestsAsync()
    {
        if (!await _runLock.WaitAsync(0))
        {
            return new TestRunAllResult
            {
                Results = [],
                BuildError = "Another test run is already in progress. Please wait for it to finish."
            };
        }

        var resultsFile = Path.Combine(Path.GetTempPath(), $"testresults_{Guid.NewGuid()}.trx");
        try
        {
            var result = await Cli.Wrap("dotnet")
                .WithArguments([
                    "test",
                    "--logger", $"trx;LogFileName={resultsFile}",
                    .. _noWarnArgs,
                ])
                .WithWorkingDirectory(_testProjectPath)
                .WithValidation(CommandResultValidation.None)
                .ExecuteBufferedAsync();

            var consoleOutput = result.StandardOutput + result.StandardError;

            if (!File.Exists(resultsFile) && IsBuildError(consoleOutput))
            {
                return new TestRunAllResult
                {
                    Results = [],
                    BuildError = consoleOutput,
                };
            }

            return ParseTrxAllResults(resultsFile, consoleOutput);
        }
        finally
        {
            _runLock.Release();
            if (File.Exists(resultsFile)) File.Delete(resultsFile);
        }
    }

    public async Task<TestRunAllResult> RunSubsetAsync(string filter)
    {
        if (string.IsNullOrWhiteSpace(filter))
            throw new ArgumentException("Filter cannot be empty", nameof(filter));

        if (!await _runLock.WaitAsync(0))
        {
            return new TestRunAllResult
            {
                Results = [],
                BuildError = "Another test run is already in progress. Please wait for it to finish."
            };
        }

        var resultsFile = Path.Combine(Path.GetTempPath(), $"testresults_{Guid.NewGuid()}.trx");
        try
        {
            // Use FullyQualifiedName~ to match class name or namespace prefix
            var result = await Cli.Wrap("dotnet")
                .WithArguments([
                    "test",
                    "--filter", $"FullyQualifiedName~{filter}",
                    "--logger", $"trx;LogFileName={resultsFile}",
                    .. _noWarnArgs,
                ])
                .WithWorkingDirectory(_testProjectPath)
                .WithValidation(CommandResultValidation.None)
                .ExecuteBufferedAsync();

            var consoleOutput = result.StandardOutput + result.StandardError;

            if (!File.Exists(resultsFile) && IsBuildError(consoleOutput))
            {
                return new TestRunAllResult
                {
                    Results = [],
                    BuildError = consoleOutput,
                };
            }

            return ParseTrxAllResults(resultsFile, consoleOutput);
        }
        finally
        {
            _runLock.Release();
            if (File.Exists(resultsFile)) File.Delete(resultsFile);
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
            // No TRX produced — surface whatever the CLI printed so the user can see it
            if (!string.IsNullOrWhiteSpace(consoleOutput))
                result.BuildError = consoleOutput;
            return result;
        }

        var doc = XDocument.Load(trxFilePath);
        var ns = doc.Root?.GetDefaultNamespace() ?? XNamespace.None;

        // Build a lookup from testId → short class name (file-name style) for matching frontend keys.
        // TRX TestDefinitions contain: <UnitTest id="..."> <TestMethod className="Namespace.ClassName" .../>
        var classNameByTestId = new Dictionary<string, string>();
        foreach (var unitTest in doc.Descendants(ns + "UnitTest"))
        {
            var id = unitTest.Attribute("id")?.Value;
            var testMethod = unitTest.Descendants(ns + "TestMethod").FirstOrDefault();
            var fullClassName = testMethod?.Attribute("className")?.Value;
            if (id != null && fullClassName != null)
            {
                // The frontend uses the file name (last segment of the namespace-qualified class name)
                var shortClassName = fullClassName.Contains('.')
                    ? fullClassName[(fullClassName.LastIndexOf('.') + 1)..]
                    : fullClassName;
                classNameByTestId[id] = shortClassName;
            }
        }

        var unitTestResults = doc.Descendants(ns + "UnitTestResult").ToList();
        result.Total = unitTestResults.Count;

        // No tests matched — surface CLI output so the user knows what happened
        if (result.Total == 0 && !string.IsNullOrWhiteSpace(consoleOutput))
            result.BuildError = consoleOutput;

        foreach (var unitTestResult in unitTestResults)
        {
            var outcome = unitTestResult.Attribute("outcome")?.Value ?? "Failed";
            var duration = unitTestResult.Attribute("duration")?.Value ?? "0s";
            var rawTestName = unitTestResult.Attribute("testName")?.Value ?? "Unknown";
            // testName in TRX can be fully qualified (Namespace.Class.Method); extract just the method name
            var methodName = rawTestName.Contains('.') ? rawTestName[(rawTestName.LastIndexOf('.') + 1)..] : rawTestName;
            var testId = unitTestResult.Attribute("testId")?.Value;
            var errorMessage = unitTestResult.Descendants(ns + "Message").FirstOrDefault()?.Value;
            var stackTrace = unitTestResult.Descendants(ns + "StackTrace").FirstOrDefault()?.Value;

            // Build fully qualified test name as "ClassName.MethodName" to match frontend keys
            var testName = testId != null && classNameByTestId.TryGetValue(testId, out var className)
                ? $"{className}.{methodName}"
                : methodName;

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
