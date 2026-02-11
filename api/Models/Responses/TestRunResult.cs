namespace TestEngine.Models.Responses;

public class TestRunResult
{
    public string? TestName { get; set; }
    public bool Passed { get; set; }
    public required string Duration { get; set; }
    public string? Trace { get; set; }
    public string? ErrorMessage { get; set; }
}
