using TestEngine.Models.Dsl;

namespace TestEngine.Services.DslCompiler;

internal abstract class DslSubcomponentBase
{
    private readonly List<DslDiagnostic> _diagnostics;

    protected DslSubcomponentBase(List<DslDiagnostic> diagnostics)
    {
        _diagnostics = diagnostics;
    }

    protected void AddDiagnostic(string code, string message, string? section = null, string? hint = null)
    {
        _diagnostics.Add(new DslDiagnostic
        {
            Code = code,
            Message = message,
            Location = (section != null || hint != null)
                ? new DslDiagnosticLocation { Section = section, Hint = hint }
                : null
        });
    }
}
