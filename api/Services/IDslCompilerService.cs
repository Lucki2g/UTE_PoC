using TestEngine.Models.Dsl;

namespace TestEngine.Services;

public interface IDslCompilerService
{
    Task<string> CompileToCSharpAsync(DslTestDefinition dsl);
    Task<DslTestDefinition> DecompileFromCSharpAsync(string csharpCode);
    Task<bool> ValidateGeneratedCodeAsync(string csharpCode);
}
