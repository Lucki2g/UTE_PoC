using CliWrap;
using CliWrap.Buffered;
using Microsoft.Extensions.Options;
using Microsoft.PowerPlatform.Dataverse.Client;
using Microsoft.Xrm.Sdk.Query;
using System.Runtime.CompilerServices;
using System.Text.Json;

namespace TestEngine.Services;

public enum SyncPhase { XrmContext, Metadata, Workflows }
public enum SyncStatus { Started, Complete, Error }
public record SyncProgressEvent(
    SyncPhase Phase,
    SyncStatus Status,
    string Message,
    string? Detail = null);

public class MetadataService : IMetadataService
{
    private readonly string _repositoryPath;
    private readonly DataverseOptions _dataverse;
    private readonly MetadataToolsOptions _tools;
    private readonly ILogger<MetadataService> _logger;

    private readonly string DefaultEntities = "account,contact,appnotification,annotation,duplicaterule,environmentvariablevalue,environmentvariabledefinition,queue,savedquery,systemuser,task,template";

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

    // ── Non-streaming entry point (used by existing /metadata/sync) ───────────

    public async Task SyncMetadataAsync(string? environmentUrl = null)
    {
        if (string.IsNullOrWhiteSpace(_tools.Solutions))
            throw new InvalidOperationException(
                "No solutions configured. Set 'MetadataTools:Solutions' in appsettings to one or more comma-separated solution unique names.");

        var connectionString = _dataverse.BuildConnectionString(environmentUrl);
        await RunXrmContextAsync(connectionString, environmentUrl);
        await RunMetadataGeneratorAsync(connectionString, environmentUrl);
        await RunWorkflowAsync(connectionString, environmentUrl);
    }

    // ── Streaming entry point ─────────────────────────────────────────────────

    public async IAsyncEnumerable<SyncProgressEvent> SyncMetadataStreamAsync(
        string? environmentUrl = null,
        [EnumeratorCancellation] CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(_tools.Solutions))
        {
            yield return new SyncProgressEvent(SyncPhase.XrmContext, SyncStatus.Error,
                "No solutions configured",
                "Set 'MetadataTools:Solutions' in appsettings to one or more comma-separated solution unique names.");
            yield break;
        }

        // Resolve connection string outside any try/catch so we can yield the error
        string connectionString;
        string? configError = null;
        try { connectionString = _dataverse.BuildConnectionString(environmentUrl); }
        catch (InvalidOperationException ex) { connectionString = ""; configError = ex.Message; }

        if (configError is not null)
        {
            yield return new SyncProgressEvent(SyncPhase.XrmContext, SyncStatus.Error,
                "Configuration error", configError);
            yield break;
        }

        // ── Phase 1: XrmContext ───────────────────────────────────────────────
        yield return new SyncProgressEvent(SyncPhase.XrmContext, SyncStatus.Started,
            "Generating C# entity classes…");

        cancellationToken.ThrowIfCancellationRequested();
        SyncProgressEvent phase1Result = await RunPhaseAsync(
            () => RunXrmContextAsync(connectionString, environmentUrl),
            SyncPhase.XrmContext,
            "C# entity classes generated",
            "C# entity class generation failed");
        yield return phase1Result;
        if (phase1Result.Status == SyncStatus.Error) yield break;

        // ── Phase 2: MetadataGenerator ────────────────────────────────────────
        yield return new SyncProgressEvent(SyncPhase.Metadata, SyncStatus.Started,
            "Generating C# metadata classes…");

        cancellationToken.ThrowIfCancellationRequested();
        SyncProgressEvent phase2Result = await RunPhaseAsync(
            () => RunMetadataGeneratorAsync(connectionString, environmentUrl),
            SyncPhase.Metadata,
            "C# metadata classes generated",
            "C# metadata class generation failed");
        yield return phase2Result;
        if (phase2Result.Status == SyncStatus.Error) yield break;

        // ── Phase 3: Workflows ────────────────────────────────────────────────
        yield return new SyncProgressEvent(SyncPhase.Workflows, SyncStatus.Started,
            "Downloading Power Automate workflow definitions…");

        cancellationToken.ThrowIfCancellationRequested();
        SyncProgressEvent phase3Result = await RunPhaseAsync(
            () => RunWorkflowAsync(connectionString, environmentUrl),
            SyncPhase.Workflows,
            "Workflow definitions downloaded",
            "Workflow download failed");
        yield return phase3Result;
    }

    private static async Task<SyncProgressEvent> RunPhaseAsync(
        Func<Task> action,
        SyncPhase phase,
        string successMessage,
        string errorMessage)
    {
        try
        {
            await action();
            return new SyncProgressEvent(phase, SyncStatus.Complete, successMessage);
        }
        catch (Exception ex)
        {
            return new SyncProgressEvent(phase, SyncStatus.Error, errorMessage, ex.Message);
        }
    }

    // ── Phase implementations ─────────────────────────────────────────────────

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
            $"/out:{outputPath}",
            $"/servicecontextname:Xrm"
        };

        if (!string.IsNullOrWhiteSpace(_tools.Solutions))
            args.Add($"/ss:{_tools.Solutions}");

        if (!string.IsNullOrWhiteSpace(_tools.Entities))
            args.Add($"/es:{_tools.Entities},{DefaultEntities}");
        else
            args.Add($"/es:{DefaultEntities}");

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
            args.Add($"/es:{_tools.Entities},{DefaultEntities}");
        else
            args.Add($"/es:{DefaultEntities}");

        foreach (var extra in _tools.MetadataGeneratorExtraArguments)
            args.Add(extra);

        await RunToolAsync(exePath, args, "MetadataGenerator365");
    }

    private async Task RunWorkflowAsync(string connectionString, string? environmentUrl)
    {
        if (string.IsNullOrWhiteSpace(_tools.Solutions))
        {
            _logger.LogInformation("No solutions configured — skipping workflow download");
            return;
        }

        var outputPath = Path.Combine(ResolvePath(_tools.MetadataGeneratorOutputPath), "..\\Workflows");
        Directory.CreateDirectory(outputPath);

        _logger.LogInformation("Connecting to Dataverse to download workflow definitions...");

        using var client = new ServiceClient(connectionString);
        if (!client.IsReady)
        {
            throw new InvalidOperationException(
                $"Could not connect to Dataverse: {client.LastError}");
        }

        var solutionNames = _tools.Solutions
            .Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);

        var downloaded = 0;

        foreach (var solutionName in solutionNames)
        {
            _logger.LogInformation("Querying workflows in solution '{Solution}'...", solutionName);

            var solutionQuery = new QueryExpression("solution")
            {
                ColumnSet = new ColumnSet("solutionid", "uniquename"),
                Criteria = new FilterExpression()
            };
            solutionQuery.Criteria.AddCondition("uniquename", ConditionOperator.Equal, solutionName);

            var solutionResult = await client.RetrieveMultipleAsync(solutionQuery);
            if (solutionResult.Entities.Count == 0)
            {
                _logger.LogWarning("Solution '{Solution}' not found — skipping", solutionName);
                continue;
            }

            var solutionId = solutionResult.Entities[0].Id;

            var componentQuery = new QueryExpression("solutioncomponent")
            {
                ColumnSet = new ColumnSet("objectid"),
                Criteria = new FilterExpression()
            };
            componentQuery.Criteria.AddCondition("solutionid", ConditionOperator.Equal, solutionId);
            componentQuery.Criteria.AddCondition("componenttype", ConditionOperator.Equal, 29);

            var componentResult = await client.RetrieveMultipleAsync(componentQuery);
            if (componentResult.Entities.Count == 0)
            {
                _logger.LogInformation("No workflows found in solution '{Solution}'", solutionName);
                continue;
            }

            var workflowIds = componentResult.Entities
                .Select(e => e.GetAttributeValue<Guid>("objectid"))
                .ToArray();

            _logger.LogInformation(
                "Found {Count} workflow(s) in solution '{Solution}' — downloading...",
                workflowIds.Length, solutionName);

            const int batchSize = 50;
            for (var i = 0; i < workflowIds.Length; i += batchSize)
            {
                var batch = workflowIds.Skip(i).Take(batchSize).ToArray();

                var workflowQuery = new QueryExpression("workflow")
                {
                    ColumnSet = new ColumnSet("workflowid", "name", "uniquename", "clientdata", "category"),
                    Criteria = new FilterExpression()
                };
                workflowQuery.Criteria.AddCondition(
                    new ConditionExpression("workflowid", ConditionOperator.In, batch.Cast<object>().ToArray()));
                workflowQuery.Criteria.AddCondition("category", ConditionOperator.Equal, 5);

                var workflowResult = await client.RetrieveMultipleAsync(workflowQuery);

                foreach (var workflow in workflowResult.Entities)
                {
                    var name = workflow.GetAttributeValue<string>("name")
                               ?? workflow.GetAttributeValue<string>("uniquename")
                               ?? workflow.Id.ToString();

                    var clientData = workflow.GetAttributeValue<string>("clientdata");
                    if (string.IsNullOrWhiteSpace(clientData))
                    {
                        _logger.LogWarning("Workflow '{Name}' has no clientdata — skipping", name);
                        continue;
                    }

                    var safeFileName = SanitizeFileName(name) + ".json";
                    var filePath = Path.Combine(outputPath, safeFileName);

                    string prettyJson;
                    try
                    {
                        using var doc = JsonDocument.Parse(clientData);
                        prettyJson = JsonSerializer.Serialize(
                            doc.RootElement,
                            new JsonSerializerOptions { WriteIndented = true });
                    }
                    catch
                    {
                        prettyJson = clientData;
                    }

                    await File.WriteAllTextAsync(filePath, prettyJson);
                    downloaded++;
                    _logger.LogInformation("Saved workflow '{Name}' → {File}", name, safeFileName);
                }
            }
        }

        _logger.LogInformation("Workflow download complete — {Count} file(s) written to {Path}",
            downloaded, outputPath);
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

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
            throw new InvalidOperationException($"{toolName} failed (exit {result.ExitCode}): {output.Trim()}");
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

    private static string SanitizeFileName(string name)
    {
        var invalid = Path.GetInvalidFileNameChars();
        return string.Concat(name.Select(c => invalid.Contains(c) ? '_' : c));
    }
}
