using TestEngine.Models.Dsl;

namespace TestEngine.Services;

public interface IProducerDslCompilerService
{
    Task<ProducerDslCompileResult> CompileToCSharpAsync(DslProducerDefinition dsl);
    Task<ProducerDslDecompileResult> DecompileFromCSharpAsync(string csharpCode);
    Task<DslValidationResult> ValidateGeneratedCodeAsync(string csharpCode);
}
