using CliWrap;
using CliWrap.Buffered;
using Microsoft.Extensions.Options;

namespace TestEngine.Services;

public class MetadataService : IMetadataService
{
    private readonly string _repositoryPath;
    private readonly DataverseOptions _dataverse;
    private readonly MetadataToolsOptions _tools;
    private readonly ILogger<MetadataService> _logger;

    public MetadataService(
        TestProjectPaths paths,
        IOptions<DataverseOptions> dataverse,
        IOptions<MetadataToolsOptions> tools,
        ILogger<MetadataService> logger)
    {
        _repositoryPath = paths.RepositoryPath;
        _dataverse = dataverse.Value;
        _tools = tools.Value;
        _logger = logger;
    }

    public async Task SyncMetadataAsync(string? environmentUrl = null)
    {
        var connectionString = _dataverse.BuildConnectionString(environmentUrl);

        await RunXrmContextAsync(connectionString, environmentUrl);
        await RunMetadataGeneratorAsync(connectionString, environmentUrl);
    }

    private async Task RunXrmContextAsync(string connectionString, string? environmentUrl)
    {
        var exePath = ResolvePath(_tools.XrmContextPath);
        var outputPath = ResolvePath(_tools.XrmContextOutputPath);

        EnsureExecutableExists(exePath, "XrmContext");
        Directory.CreateDirectory(outputPath);

        var args = new List<string>
        {
            $"/url:{environmentUrl ?? _dataverse.Url}",
            $"/method:ConnectionString",
            $"/connectionString:{connectionString}",
            $"/out:{outputPath}"
        };

        if (!string.IsNullOrWhiteSpace(_tools.Solutions))
            args.Add($"/ss:{_tools.Solutions}");

        if (!string.IsNullOrWhiteSpace(_tools.Entities))
            args.Add($"/es:{_tools.Entities}");

        if (!string.IsNullOrWhiteSpace(_tools.XrmContextNamespace))
            args.Add($"/ns:{_tools.XrmContextNamespace}");

        foreach (var extra in _tools.XrmContextExtraArguments)
            args.Add(extra);

        await RunToolAsync(exePath, args, "XrmContext");
    }

    private async Task RunMetadataGeneratorAsync(string connectionString, string? environmentUrl)
    {
        var exePath = ResolvePath(_tools.MetadataGeneratorPath);
        var outputPath = ResolvePath(_tools.MetadataGeneratorOutputPath);

        EnsureExecutableExists(exePath, "MetadataGenerator365");
        Directory.CreateDirectory(outputPath);

        var args = new List<string>
        {
            $"/url:{environmentUrl ?? _dataverse.Url}",
            $"/method:ConnectionString",
            $"/connectionString:{connectionString}",
            $"/out:{outputPath}"
        };

        if (!string.IsNullOrWhiteSpace(_tools.Solutions))
            args.Add($"/ss:{_tools.Solutions}");

        if (!string.IsNullOrWhiteSpace(_tools.Entities))
            args.Add($"/es:{_tools.Entities}");

        foreach (var extra in _tools.MetadataGeneratorExtraArguments)
            args.Add(extra);

        await RunToolAsync(exePath, args, "MetadataGenerator365");
    }

    private async Task RunToolAsync(string exePath, List<string> arguments, string toolName)
    {
        _logger.LogInformation("Running {Tool} with arguments: {Args}", toolName, string.Join(" ", arguments));

        var result = await Cli.Wrap(exePath)
            .WithArguments(arguments)
            .WithWorkingDirectory(_repositoryPath)
            .WithValidation(CommandResultValidation.None)
            .ExecuteBufferedAsync();

        var output = result.StandardOutput + result.StandardError;

        if (result.ExitCode != 0)
        {
            _logger.LogError("{Tool} failed (exit code {ExitCode}): {Output}", toolName, result.ExitCode, output);
            throw new InvalidOperationException($"{toolName} failed with exit code {result.ExitCode}: {output}");
        }

        _logger.LogInformation("{Tool} completed successfully", toolName);
    }

    private string ResolvePath(string relativePath)
    {
        return Path.GetFullPath(Path.Combine(_repositoryPath, relativePath));
    }

    private static void EnsureExecutableExists(string exePath, string toolName)
    {
        if (!File.Exists(exePath))
        {
            throw new FileNotFoundException(
                $"{toolName} executable not found at '{exePath}'. Ensure the consumer repository contains the tool and the path is configured correctly in MetadataTools settings.");
        }
    }
}
