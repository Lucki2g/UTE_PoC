using TestEngine.Models.Dsl;
using TestEngine.Models.Responses;

namespace TestEngine.Services;

public class TestService : ITestService
{
    private readonly string _testProjectPath;
    private readonly IDslCompilerService _dslCompiler;
    private readonly IFileManagerService _fileManager;
    private readonly IDataProducerService _dataProducerService;

    public TestService(TestProjectPaths paths, IDslCompilerService dslCompiler, IFileManagerService fileManager, IDataProducerService dataProducerService)
    {
        _testProjectPath = paths.TestProjectPath;
        _dslCompiler = dslCompiler;
        _fileManager = fileManager;
        _dataProducerService = dataProducerService;
    }

    public async Task<IEnumerable<TestMetadata>> GetAllTestsAsync()
    {
        var producerEntityMap = await BuildProducerEntityMapAsync();
        var csFiles = _fileManager.GetFiles(_testProjectPath, "*.cs");
        var results = new List<TestMetadata>();

        foreach (var filePath in csFiles)
        {
            var code = await _fileManager.ReadFileAsync(filePath);
            if (!ContainsTestAttribute(code))
                continue;

            var decompileResult = await _dslCompiler.DecompileFromCSharpAsync(code, producerEntityMap);
            var methodNames = ExtractTestMethodNames(code);

            results.Add(new TestMetadata
            {
                ClassName = Path.GetFileNameWithoutExtension(filePath),
                FilePath = Path.GetRelativePath(_testProjectPath, filePath),
                MethodNames = methodNames,
                LastModified = File.GetLastWriteTimeUtc(filePath),
                Dsl = decompileResult.Dsl
            });
        }

        return results;
    }

    public async Task CreateTestAsync(DslTestDefinition dsl)
    {
        var className = DeriveClassName(dsl.Test.Name);

        var existingFile = FindTestFile(className);
        if (existingFile != null)
            throw new ArgumentException($"Test class '{className}' already exists");

        var compileResult = await _dslCompiler.CompileToCSharpAsync(dsl, new DslCompileOptions
        {
            EmitClassShell = true,
            ClassName = className
        });

        if (compileResult.Diagnostics.Any(d => d.Code != null))
        {
            var validation = await _dslCompiler.ValidateGeneratedCodeAsync(compileResult.CSharpCode);
            if (!validation.IsValid)
                throw new ArgumentException(
                    $"Generated code has syntax errors: {string.Join("; ", validation.Diagnostics.Select(d => d.Message))}");
        }

        var filePath = Path.Combine(_testProjectPath, $"{className}.cs");
        await _fileManager.WriteFileAsync(filePath, compileResult.CSharpCode);
    }

    public async Task UpdateTestAsync(string className, DslTestDefinition dsl)
    {
        if (string.IsNullOrWhiteSpace(className))
            throw new ArgumentException("Class name cannot be empty", nameof(className));

        var filePath = FindTestFile(className);
        if (filePath == null)
            throw new FileNotFoundException($"Test class '{className}' not found");

        var compileResult = await _dslCompiler.CompileToCSharpAsync(dsl, new DslCompileOptions
        {
            EmitClassShell = true,
            ClassName = className
        });

        var validation = await _dslCompiler.ValidateGeneratedCodeAsync(compileResult.CSharpCode);
        if (!validation.IsValid)
            throw new ArgumentException(
                $"Generated code has syntax errors: {string.Join("; ", validation.Diagnostics.Select(d => d.Message))}");

        await _fileManager.WriteFileAsync(filePath, compileResult.CSharpCode);
    }

    public async Task DeleteTestAsync(string className)
    {
        if (string.IsNullOrWhiteSpace(className))
            throw new ArgumentException("Class name cannot be empty", nameof(className));

        var filePath = FindTestFile(className);
        if (filePath == null)
            throw new FileNotFoundException($"Test class '{className}' not found");

        await _fileManager.DeleteFileAsync(filePath);
    }

    private string? FindTestFile(string className)
    {
        var searchPattern = $"{className}.cs";
        var files = _fileManager.GetFiles(_testProjectPath, searchPattern);
        return files.FirstOrDefault();
    }

    private static bool ContainsTestAttribute(string code)
    {
        return code.Contains("[Fact") || code.Contains("[Theory")
            || code.Contains("[TestMethod") || code.Contains("[Test]")
            || code.Contains("[Test(");
    }

    private static List<string> ExtractTestMethodNames(string code)
    {
        var methods = new List<string>();
        var lines = code.Split('\n');

        for (var i = 0; i < lines.Length; i++)
        {
            var trimmed = lines[i].TrimStart();
            if (!trimmed.StartsWith("[Fact") && !trimmed.StartsWith("[Theory")
                && !trimmed.StartsWith("[TestMethod") && !trimmed.StartsWith("[Test]")
                && !trimmed.StartsWith("[Test("))
                continue;

            // Look ahead for the method signature
            for (var j = i + 1; j < lines.Length && j <= i + 5; j++)
            {
                var candidate = lines[j].Trim();
                if (candidate.Contains('(') && (candidate.Contains("void ") || candidate.Contains("Task ")
                    || candidate.Contains("async ")))
                {
                    var methodName = ExtractMethodName(candidate);
                    if (methodName != null)
                        methods.Add(methodName);
                    break;
                }
            }
        }

        return methods;
    }

    private static string? ExtractMethodName(string methodSignature)
    {
        var parenIndex = methodSignature.IndexOf('(');
        if (parenIndex < 0) return null;

        var beforeParen = methodSignature[..parenIndex].Trim();
        var lastSpace = beforeParen.LastIndexOf(' ');
        if (lastSpace < 0) return null;

        return beforeParen[(lastSpace + 1)..];
    }

    private static string DeriveClassName(string testName)
    {
        var parts = testName.Split('_');
        var baseName = parts[0];
        return baseName.EndsWith("Tests", StringComparison.Ordinal) ? baseName : baseName + "Tests";
    }

    private async Task<Dictionary<string, string>> BuildProducerEntityMapAsync()
    {
        var producers = await _dataProducerService.GetAllProducersAsync();
        var map = new Dictionary<string, string>();

        foreach (var producer in producers)
        {
            foreach (var draft in producer.Dsl.Drafts)
            {
                map[draft.Id] = draft.Entity.LogicalName;
            }
        }

        return map;
    }
}
