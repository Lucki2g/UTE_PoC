using TestEngine.Models.Dsl;
using TestEngine.Models.Responses;

namespace TestEngine.Services;

public class DataProducerService : IDataProducerService
{
    private readonly string _dataProducersPath;
    private readonly IFileManagerService _fileManager;
    private readonly IProducerDslCompilerService _producerDslCompiler;

    public DataProducerService(
        TestProjectPaths paths,
        IFileManagerService fileManager,
        IProducerDslCompilerService producerDslCompiler)
    {
        _dataProducersPath = paths.DataProducersPath;
        _fileManager = fileManager;
        _producerDslCompiler = producerDslCompiler;
    }

    public async Task<IEnumerable<ProducerMetadata>> GetAllProducersAsync()
    {
        var csFiles = _fileManager.GetFiles(_dataProducersPath, "DataProducer.*.cs", recursive: false);
        var results = new List<ProducerMetadata>();

        foreach (var filePath in csFiles)
        {
            var code = await _fileManager.ReadFileAsync(filePath);
            var decompileResult = await _producerDslCompiler.DecompileFromCSharpAsync(code);

            var entityName = ExtractEntityNameFromFileName(filePath);
            var methodNames = decompileResult.Dsl.Drafts.Select(d => d.Id).ToList();

            results.Add(new ProducerMetadata
            {
                EntityName = entityName,
                FilePath = Path.GetRelativePath(_dataProducersPath, filePath),
                MethodNames = methodNames,
                Dsl = decompileResult.Dsl
            });
        }

        return results;
    }

    public async Task CreateProducerAsync(DslProducerDefinition dsl)
    {
        if (dsl.Drafts.Count == 0)
            throw new ArgumentException("DSL must contain at least one draft definition.");

        var entityName = DeriveEntitySuffix(dsl);
        var fileName = $"DataProducer.{entityName}.cs";
        var filePath = Path.Combine(_dataProducersPath, fileName);

        if (_fileManager.FileExists(filePath))
            throw new ArgumentException($"Producer file '{fileName}' already exists.");

        var compileResult = await _producerDslCompiler.CompileToCSharpAsync(dsl);

        var validation = await _producerDslCompiler.ValidateGeneratedCodeAsync(compileResult.CSharpCode);
        if (!validation.IsValid)
            throw new ArgumentException(
                $"Generated code has syntax errors: {string.Join("; ", validation.Diagnostics.Select(d => d.Message))}");

        await _fileManager.WriteFileAsync(filePath, compileResult.CSharpCode);
    }

    public async Task UpdateProducerAsync(string entityName, DslProducerDefinition dsl)
    {
        if (string.IsNullOrWhiteSpace(entityName))
            throw new ArgumentException("Entity name cannot be empty.", nameof(entityName));

        var filePath = FindProducerFile(entityName)
            ?? throw new FileNotFoundException($"Producer file for entity '{entityName}' not found.");

        var compileResult = await _producerDslCompiler.CompileToCSharpAsync(dsl);

        var validation = await _producerDslCompiler.ValidateGeneratedCodeAsync(compileResult.CSharpCode);
        if (!validation.IsValid)
            throw new ArgumentException(
                $"Generated code has syntax errors: {string.Join("; ", validation.Diagnostics.Select(d => d.Message))}");

        await _fileManager.WriteFileAsync(filePath, compileResult.CSharpCode);
    }

    private string? FindProducerFile(string entityName)
    {
        var searchPattern = $"DataProducer.{entityName}.cs";
        var files = _fileManager.GetFiles(_dataProducersPath, searchPattern, recursive: false);
        return files.FirstOrDefault();
    }

    private static string ExtractEntityNameFromFileName(string filePath)
    {
        // DataProducer.Skill.cs -> Skill
        var fileName = Path.GetFileNameWithoutExtension(filePath); // DataProducer.Skill
        var prefix = "DataProducer.";
        if (fileName.StartsWith(prefix, StringComparison.Ordinal))
            return fileName[prefix.Length..];
        return fileName;
    }

    private static string DeriveEntitySuffix(DslProducerDefinition dsl)
    {
        // Use the first draft's entity logical name to derive the file suffix
        // e.g., ape_skill -> Skill, ape_developerskill -> DeveloperSkill
        var firstEntity = dsl.Drafts[0].Entity.LogicalName;
        var parts = firstEntity.Split('_');
        if (parts.Length > 1)
        {
            // Capitalize each part after the prefix: ape_skill -> Skill
            return string.Concat(parts.Skip(1).Select(p =>
                char.ToUpperInvariant(p[0]) + p[1..]));
        }
        return char.ToUpperInvariant(firstEntity[0]) + firstEntity[1..];
    }
}
