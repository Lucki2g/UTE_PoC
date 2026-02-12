using TestEngine.Models.Dsl;
using TestEngine.Models.Responses;

namespace TestEngine.Services;

public class TestService : ITestService
{
    private readonly string _testProjectPath;
    private readonly IDslCompilerService _dslCompiler;
    private readonly IFileManagerService _fileManager;

    public TestService(IConfiguration configuration, IDslCompilerService dslCompiler, IFileManagerService fileManager)
    {
        var repositoryPath = configuration["TestProject:RepositoryPath"]
            ?? throw new InvalidOperationException("TestProject:RepositoryPath not configured");
        var testProjectRelativePath = configuration["TestProject:TestProjectPath"] ?? "Tests";
        _testProjectPath = Path.Combine(repositoryPath, testProjectRelativePath);
        _dslCompiler = dslCompiler;
        _fileManager = fileManager;
    }

    public async Task<IEnumerable<TestMetadata>> GetAllTestsAsync()
    {
        // TODO: Scan test project for test classes, decompile to DSL
        throw new NotImplementedException("Get all tests with DSL decompilation not yet implemented");
    }

    public async Task CreateTestAsync(DslTestDefinition dsl)
    {
        // TODO: Compile DSL to C# and create file
        throw new NotImplementedException("Create test from DSL not yet implemented");
    }

    public async Task UpdateTestAsync(string className, DslTestDefinition dsl)
    {
        // TODO: Parse existing file with Roslyn, apply updates from DSL
        throw new NotImplementedException("Update test from DSL not yet implemented");
    }

    public async Task DeleteTestAsync(string className)
    {
        if (string.IsNullOrWhiteSpace(className))
        {
            throw new ArgumentException("Class name cannot be empty", nameof(className));
        }

        var filePath = FindTestFile(className);
        if (filePath == null)
        {
            throw new FileNotFoundException($"Test class '{className}' not found");
        }

        File.Delete(filePath);
    }

    private string? FindTestFile(string className)
    {
        var searchPattern = $"{className}.cs";
        var files = Directory.GetFiles(_testProjectPath, searchPattern, SearchOption.AllDirectories);
        return files.FirstOrDefault();
    }
}
