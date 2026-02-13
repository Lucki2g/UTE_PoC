using TestEngine.Models.Dsl;

namespace TestEngine.Services;

public interface IDslCompilerService
{
    Task<DslCompileResult> CompileToCSharpAsync(DslTestDefinition dsl, DslCompileOptions? options = null);
    Task<DslDecompileResult> DecompileFromCSharpAsync(string csharpCode);
    Task<DslValidationResult> ValidateGeneratedCodeAsync(string csharpCode);
}
