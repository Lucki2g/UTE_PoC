using CliWrap;
using CliWrap.Buffered;

namespace TestEngine.Services;

public class GitService : IGitService
{
    private readonly string _repositoryPath;
    private readonly string _mainBranch;
    private readonly string _remoteName;
    private readonly string? _githubToken;
    private readonly string? _githubOwner;
    private readonly string? _githubRepository;

    public GitService(IConfiguration configuration)
    {
        _repositoryPath = configuration["TestProject:RepositoryPath"]
            ?? throw new InvalidOperationException("TestProject:RepositoryPath not configured");
        _mainBranch = configuration["Git:MainBranch"] ?? "main";
        _remoteName = configuration["Git:RemoteName"] ?? "origin";
        _githubToken = configuration["GitHub:Token"];
        _githubOwner = configuration["GitHub:Owner"];
        _githubRepository = configuration["GitHub:Repository"];
    }

    public async Task<string> GetCurrentBranchAsync()
    {
        var result = await Cli.Wrap("git")
            .WithArguments(["rev-parse", "--abbrev-ref", "HEAD"])
            .WithWorkingDirectory(_repositoryPath)
            .ExecuteBufferedAsync();

        return result.StandardOutput.Trim();
    }

    public async Task LoadBranchAsync(string branchName)
    {
        ValidateBranchName(branchName);

        // Try to checkout local branch first
        try
        {
            await ExecuteGitAsync("checkout", branchName);
            return;
        }
        catch
        {
            // Branch doesn't exist locally, try to fetch from remote
        }

        // Fetch and checkout from remote
        await ExecuteGitAsync("fetch", _remoteName, branchName);
        await ExecuteGitAsync("checkout", "-b", branchName, $"{_remoteName}/{branchName}");
    }

    public async Task CreateNewBranchAsync(string branchName)
    {
        ValidateBranchName(branchName);

        // Check if branch already exists
        var existingBranches = await ExecuteGitBufferedAsync("branch", "-a");
        if (existingBranches.Contains(branchName))
        {
            throw new InvalidOperationException($"Branch '{branchName}' already exists");
        }

        // Fetch, checkout main, pull, create new branch
        await ExecuteGitAsync("fetch", _remoteName);
        await ExecuteGitAsync("checkout", _mainBranch);
        await ExecuteGitAsync("pull", _remoteName, _mainBranch);
        await ExecuteGitAsync("checkout", "-b", branchName);
    }

    public async Task SaveChangesAsync(string message)
    {
        if (string.IsNullOrWhiteSpace(message))
        {
            throw new ArgumentException("Commit message cannot be empty", nameof(message));
        }

        // Check if there are changes to commit
        var status = await ExecuteGitBufferedAsync("status", "--porcelain");
        if (string.IsNullOrWhiteSpace(status))
        {
            throw new InvalidOperationException("Nothing to commit");
        }

        await ExecuteGitAsync("add", ".");
        await ExecuteGitAsync("commit", "-m", message);
    }

    public async Task PublishBranchAsync()
    {
        var currentBranch = await GetCurrentBranchAsync();
        await ExecuteGitAsync("push", "-u", _remoteName, currentBranch);
    }

    public async Task<string> CreatePullRequestAsync(string targetBranch, string title, string description)
    {
        ValidateBranchName(targetBranch);

        if (string.IsNullOrWhiteSpace(_githubToken) ||
            string.IsNullOrWhiteSpace(_githubOwner) ||
            string.IsNullOrWhiteSpace(_githubRepository))
        {
            throw new NotImplementedException("Pull request creation requires GitHub configuration. TODO: Implement GitHub/Azure DevOps REST API call.");
        }

        var currentBranch = await GetCurrentBranchAsync();

        // TODO: Implement actual GitHub/Azure DevOps REST API call
        throw new NotImplementedException("Pull request creation via GitHub/Azure DevOps REST API not yet implemented");
    }

    private async Task ExecuteGitAsync(params string[] arguments)
    {
        await Cli.Wrap("git")
            .WithArguments(arguments)
            .WithWorkingDirectory(_repositoryPath)
            .ExecuteAsync();
    }

    private async Task<string> ExecuteGitBufferedAsync(params string[] arguments)
    {
        var result = await Cli.Wrap("git")
            .WithArguments(arguments)
            .WithWorkingDirectory(_repositoryPath)
            .ExecuteBufferedAsync();

        return result.StandardOutput;
    }

    private static void ValidateBranchName(string branchName)
    {
        if (string.IsNullOrWhiteSpace(branchName))
        {
            throw new ArgumentException("Branch name cannot be empty", nameof(branchName));
        }

        // Prevent command injection by validating branch name
        var invalidChars = new[] { ' ', '~', '^', ':', '?', '*', '[', '\\', '\n', '\r', '\t' };
        if (branchName.Any(c => invalidChars.Contains(c)))
        {
            throw new ArgumentException("Branch name contains invalid characters", nameof(branchName));
        }

        if (branchName.StartsWith('-') || branchName.StartsWith('.') || branchName.EndsWith('.') || branchName.EndsWith('/'))
        {
            throw new ArgumentException("Branch name has invalid format", nameof(branchName));
        }

        if (branchName.Contains(".."))
        {
            throw new ArgumentException("Branch name cannot contain '..'", nameof(branchName));
        }
    }
}
