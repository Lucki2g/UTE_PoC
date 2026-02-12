using TestEngine.Models.Responses;

namespace TestEngine.Services;

public interface IGitService
{
    Task<CloneResult> CloneRepositoryAsync(string repositoryUrl);
    Task<RepositoryStatus> GetStatusAsync();
    Task<string> GetCurrentBranchAsync();
    Task LoadBranchAsync(string branchName);
    Task CreateNewBranchAsync(string branchName);
    Task SaveChangesAsync(string message);
    Task PublishBranchAsync();
    Task<string> CreatePullRequestAsync(string targetBranch, string title, string description);
}
