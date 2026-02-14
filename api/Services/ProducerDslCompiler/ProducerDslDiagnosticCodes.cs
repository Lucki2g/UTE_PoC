using TestEngine.Models.Dsl;

namespace TestEngine.Services;

public static class ProducerDslDiagnosticCodes
{
    public const string NoDataProducerClass = "PRODUCER_NO_CLASS";
    public const string InvalidDraftSignature = "PRODUCER_INVALID_SIGNATURE";
    public const string UnsupportedEnsureValue = "PRODUCER_UNSUPPORTED_ENSURE";
    public const string UnsupportedValueKind = "PRODUCER_UNSUPPORTED_VALUE";
    public const string DuplicateDraftId = "PRODUCER_DUPLICATE_DRAFT_ID";
    public const string UnresolvedDraftReference = "PRODUCER_UNRESOLVED_REF";
    public const string SelfReferenceMissing = "PRODUCER_SELF_REF_MISSING";
    public const string CircularReference = "PRODUCER_CIRCULAR_REF";
}

public class ProducerDslCompileResult
{
    public required string CSharpCode { get; set; }
    public List<DslDiagnostic> Diagnostics { get; set; } = [];
}

public class ProducerDslDecompileResult
{
    public required DslProducerDefinition Dsl { get; set; }
    public List<DslDiagnostic> Diagnostics { get; set; } = [];
}
