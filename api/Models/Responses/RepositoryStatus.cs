namespace TestEngine.Models.Responses;

public class RepositoryStatus
{
    public bool Cloned { get; set; }
    public string? Branch { get; set; }
    public bool? Clean { get; set; }
    public int? ChangedFiles { get; set; }
    public required string Path { get; set; }
}
