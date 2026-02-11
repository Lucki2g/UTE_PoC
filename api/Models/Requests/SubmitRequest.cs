namespace TestEngine.Models.Requests;

public class SubmitRequest
{
    public required string TargetBranch { get; set; }
    public required string Title { get; set; }
    public string? Description { get; set; }
}
