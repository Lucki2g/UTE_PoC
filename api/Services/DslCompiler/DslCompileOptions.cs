namespace TestEngine.Services;

public class DslCompileOptions
{
    public bool EmitClassShell { get; set; } = true;
    public string? ClassName { get; set; }
    public string? Namespace { get; set; }
    public string BaseClass { get; set; } = "TestBase";
    public string FixtureType { get; set; } = "XrmMockupFixture";
}
