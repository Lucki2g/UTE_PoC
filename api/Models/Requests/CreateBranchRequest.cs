namespace TestEngine.Models.Requests;

public class CreateBranchRequest
{
    public required string BranchName { get; set; }
    /// <summary>
    /// Optional folder prefix for the branch, e.g. the current user's alias.
    /// When provided the branch is created as "{UserFolder}/{BranchName}".
    /// </summary>
    public string? UserFolder { get; set; }
}
