using TestEngine.Models.Dsl;

namespace TestEngine.Services;

public interface IDslCompilerService
{
    Task<DslCompileResult> CompileToCSharpAsync(DslTestDefinition dsl, DslCompileOptions? options = null);
    Task<DslDecompileResult> DecompileFromCSharpAsync(string csharpCode, IReadOnlyDictionary<string, string>? producerEntityMap = null);
    Task<DslValidationResult> ValidateGeneratedCodeAsync(string csharpCode);
}
