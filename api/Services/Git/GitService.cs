using CliWrap;
using CliWrap.Buffered;
using TestEngine.Models.Responses;

namespace TestEngine.Services;

public class GitService : IGitService
{
    private readonly string _repositoryPath;
    private readonly string _mainBranch;
    private readonly string _remoteName;
    private readonly string? _githubToken;
    private readonly string? _githubOwner;
    private readonly string? _githubRepository;

    public GitService(TestProjectPaths paths, IConfiguration configuration)
    {
        _repositoryPath = paths.RepositoryPath;
        _mainBranch = configuration["Git:MainBranch"] ?? "main";
        _remoteName = configuration["Git:RemoteName"] ?? "origin";
        _githubToken = configuration["GitHub:Token"];
        _githubOwner = configuration["GitHub:Owner"];
        _githubRepository = configuration["GitHub:Repository"];
    }

    public async Task<CloneResult> CloneRepositoryAsync(string repositoryUrl)
    {
        ValidateRepositoryUrl(repositoryUrl);

        var gitDir = Path.Combine(_repositoryPath, ".git");
        if (Directory.Exists(gitDir))
        {
            throw new InvalidOperationException("Repository is already cloned at the configured path");
        }

        // Ensure parent directory exists
        var parentDir = Path.GetDirectoryName(_repositoryPath);
        if (parentDir != null)
        {
            Directory.CreateDirectory(parentDir);
        }

        // Inject token into URL for authentication if configured
        var cloneUrl = repositoryUrl;
        var tokenUsed = false;
        if (!string.IsNullOrWhiteSpace(_githubToken))
        {
            cloneUrl = InjectTokenIntoUrl(repositoryUrl, _githubToken);
            tokenUsed = true;
        }

        // Clone the repository
        await Cli.Wrap("git")
            .WithArguments(["clone", cloneUrl, _repositoryPath])
            .ExecuteAsync();

        // Reset remote URL to token-free version so credentials aren't persisted
        if (tokenUsed)
        {
            await ExecuteGitAsync("remote", "set-url", _remoteName, repositoryUrl);
        }

        var branch = await GetCurrentBranchAsync();

        return new CloneResult
        {
            Message = "Repository cloned successfully",
            Branch = branch,
            Path = _repositoryPath
        };
    }

    public async Task<RepositoryStatus> GetStatusAsync()
    {
        var gitDir = Path.Combine(_repositoryPath, ".git");
        if (!Directory.Exists(gitDir))
        {
            return new RepositoryStatus
            {
                Cloned = false,
                Path = _repositoryPath
            };
        }

        var branch = await GetCurrentBranchAsync();
        var statusOutput = await ExecuteGitBufferedAsync("status", "--porcelain");
        var changedLines = statusOutput
            .Split('\n', StringSplitOptions.RemoveEmptyEntries);

        return new RepositoryStatus
        {
            Cloned = true,
            Branch = branch,
            Clean = changedLines.Length == 0,
            ChangedFiles = changedLines.Length,
            Path = _repositoryPath
        };
    }

    public async Task<string> GetCurrentBranchAsync()
    {
        EnsureRepositoryExists();

        var result = await Cli.Wrap("git")
            .WithArguments(["rev-parse", "--abbrev-ref", "HEAD"])
            .WithWorkingDirectory(_repositoryPath)
            .ExecuteBufferedAsync();

        return result.StandardOutput.Trim();
    }

    public async Task LoadBranchAsync(string branchName)
    {
        EnsureRepositoryExists();
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
        EnsureRepositoryExists();
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
        EnsureRepositoryExists();

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
        EnsureRepositoryExists();

        var currentBranch = await GetCurrentBranchAsync();
        await ExecuteGitAsync("push", "-u", _remoteName, currentBranch);
    }

    public async Task<string> CreatePullRequestAsync(string targetBranch, string title, string description)
    {
        EnsureRepositoryExists();
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

    private void EnsureRepositoryExists()
    {
        var gitDir = Path.Combine(_repositoryPath, ".git");
        if (!Directory.Exists(gitDir))
        {
            throw new InvalidOperationException("Repository not initialized. Call POST /git/clone first.");
        }
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

    private static string InjectTokenIntoUrl(string url, string token)
    {
        // https://github.com/org/repo.git → https://<token>@github.com/org/repo.git
        const string prefix = "https://";
        if (!url.StartsWith(prefix, StringComparison.OrdinalIgnoreCase))
        {
            return url;
        }

        return $"{prefix}{token}@{url[prefix.Length..]}";
    }

    private static void ValidateRepositoryUrl(string url)
    {
        if (string.IsNullOrWhiteSpace(url))
        {
            throw new ArgumentException("Repository URL cannot be empty", nameof(url));
        }

        if (!url.StartsWith("https://", StringComparison.OrdinalIgnoreCase))
        {
            throw new ArgumentException("Repository URL must use HTTPS", nameof(url));
        }

        var allowedHosts = new[] { "github.com", "dev.azure.com" };
        var uri = new Uri(url);
        if (!allowedHosts.Any(host => uri.Host.Equals(host, StringComparison.OrdinalIgnoreCase)))
        {
            throw new ArgumentException($"Repository URL must be hosted on: {string.Join(", ", allowedHosts)}", nameof(url));
        }
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
