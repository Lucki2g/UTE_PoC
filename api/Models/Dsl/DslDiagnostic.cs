using System.Text.Json.Serialization;

namespace TestEngine.Models.Dsl;

public class DslDiagnostic
{
    [JsonPropertyName("code")]
    public required string Code { get; set; }

    [JsonPropertyName("message")]
    public required string Message { get; set; }

    [JsonPropertyName("location")]
    public DslDiagnosticLocation? Location { get; set; }
}

public class DslDiagnosticLocation
{
    [JsonPropertyName("section")]
    public string? Section { get; set; }

    [JsonPropertyName("hint")]
    public string? Hint { get; set; }
}

public static class DslDiagnosticCodes
{
    public const string UnsupportedAssertion = "UNSUPPORTED_ASSERTION";
    public const string UnsupportedLinqShape = "UNSUPPORTED_LINQ_SHAPE";
    public const string MultipleActCalls = "MULTIPLE_ACT_CALLS";
    public const string MissingAaaSections = "MISSING_AAA_SECTIONS";
    public const string AmbiguousTestFramework = "AMBIGUOUS_TEST_FRAMEWORK";
    public const string UnsupportedTimeoutXunit = "UNSUPPORTED_TIMEOUT_XUNIT";
    public const string UnknownOperationKind = "UNKNOWN_OPERATION_KIND";
    public const string UnresolvedReference = "UNRESOLVED_REFERENCE";
}

public class DslCompileResult
{
    public required string CSharpCode { get; set; }
    public List<DslDiagnostic> Diagnostics { get; set; } = [];
}

public class DslDecompileResult
{
    public required DslTestDefinition Dsl { get; set; }
    public List<DslDiagnostic> Diagnostics { get; set; } = [];
}

public class DslValidationResult
{
    public bool IsValid { get; set; }
    public List<DslDiagnostic> Diagnostics { get; set; } = [];
}
