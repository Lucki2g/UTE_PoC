namespace TestEngine.Models.Requests;

public class RunSubsetRequest
{
    /// <summary>Filter passed to dotnet test --filter. Can be a class name or a folder path prefix.</summary>
    public required string Filter { get; set; }
}
