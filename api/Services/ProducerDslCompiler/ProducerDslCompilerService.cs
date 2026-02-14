using Microsoft.CodeAnalysis;
using Microsoft.CodeAnalysis.CSharp;
using TestEngine.Models.Dsl;

namespace TestEngine.Services;

public class ProducerDslCompilerService : IProducerDslCompilerService
{
    public Task<ProducerDslCompileResult> CompileToCSharpAsync(DslProducerDefinition dsl)
    {
        var compiler = new ProducerDslToCSharpCompiler();
        var result = compiler.Compile(dsl);
        return Task.FromResult(result);
    }

    public Task<ProducerDslDecompileResult> DecompileFromCSharpAsync(string csharpCode)
    {
        var decompiler = new CSharpToProducerDslDecompiler();
        var result = decompiler.Decompile(csharpCode);
        return Task.FromResult(result);
    }

    public Task<DslValidationResult> ValidateGeneratedCodeAsync(string csharpCode)
    {
        var tree = CSharpSyntaxTree.ParseText(csharpCode);
        var diagnostics = tree.GetDiagnostics()
            .Where(d => d.Severity == DiagnosticSeverity.Error)
            .Select(d => new DslDiagnostic
            {
                Code = d.Id,
                Message = d.GetMessage(),
                Location = new DslDiagnosticLocation
                {
                    Section = "syntax",
                    Hint = d.Location.GetLineSpan().ToString()
                }
            })
            .ToList();

        return Task.FromResult(new DslValidationResult
        {
            IsValid = diagnostics.Count == 0,
            Diagnostics = diagnostics
        });
    }
}
