using Microsoft.CodeAnalysis;
using Microsoft.CodeAnalysis.CSharp;
using TestEngine.Models.Dsl;

namespace TestEngine.Services;

public class DslCompilerService : IDslCompilerService
{
    public Task<DslCompileResult> CompileToCSharpAsync(DslTestDefinition dsl, DslCompileOptions? options = null)
    {
        options ??= new DslCompileOptions();
        var compiler = new DslToCSharpCompiler(options);
        var result = compiler.Compile(dsl);
        return Task.FromResult(result);
    }

    public Task<DslDecompileResult> DecompileFromCSharpAsync(string csharpCode, IReadOnlyDictionary<string, string>? producerEntityMap = null)
    {
        var decompiler = new CSharpToDslDecompiler(producerEntityMap);
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
