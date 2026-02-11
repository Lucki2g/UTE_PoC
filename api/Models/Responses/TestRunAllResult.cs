namespace TestEngine.Models.Responses;

public class TestRunAllResult
{
    public int Total { get; set; }
    public int Passed { get; set; }
    public int Failed { get; set; }
    public required List<TestRunResult> Results { get; set; }
}
