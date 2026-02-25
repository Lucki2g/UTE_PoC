using Microsoft.CodeAnalysis;
using Microsoft.CodeAnalysis.CSharp;
using TestEngine.Models.Dsl;
using TestEngine.Services.DslCompiler;

namespace TestEngine.Services;

internal class CSharpToDslDecompiler
{
    private readonly List<DslDiagnostic> _diagnostics = [];
    private readonly IReadOnlyDictionary<string, string> _producerEntityMap;

    private readonly TestMethodParser   _methodParser;
    private readonly AaaSectionSplitter _splitter;
    private readonly ArrangeParser      _arrangeParser;
    private readonly ActParser          _actParser;
    private readonly AssertParser       _assertParser;

    /// <param name="producerEntityMap">Maps draft method names (e.g. "DraftValidSkill") to entity logical names (e.g. "ape_skill").</param>
    public CSharpToDslDecompiler(IReadOnlyDictionary<string, string>? producerEntityMap = null)
    {
        _producerEntityMap = producerEntityMap ?? new Dictionary<string, string>();

        var expr = new ExpressionDecompiler(_diagnostics);

        _methodParser  = new TestMethodParser(_diagnostics);
        _splitter      = new AaaSectionSplitter(_diagnostics);
        _arrangeParser = new ArrangeParser(_diagnostics, expr, _producerEntityMap);

        _actParser = new ActParser(_diagnostics,
        [
            new CreateOperationParser(),
            new UpdateOperationParser(),
            new DeleteOperationParser(expr),
            new RelationshipOperationParser(expr, "AssociateEntities",    "associate"),
            new RelationshipOperationParser(expr, "DisassociateEntities", "disassociate"),
        ]);

        _assertParser = new AssertParser(_diagnostics, expr,
        [
            new NotNullAssertionParser(),
            new BeAssertionParser(expr),
            new ContainSingleAssertionParser(expr),
        ]);
    }

    public DslDecompileResult Decompile(string csharpCode)
    {
        var tree = CSharpSyntaxTree.ParseText(csharpCode);
        var root = tree.GetRoot();

        var method = _methodParser.FindTestMethod(root);
        if (method == null)
        {
            _diagnostics.Add(new DslDiagnostic
            {
                Code    = DslDiagnosticCodes.MissingAaaSections,
                Message = "No test method found with [Fact], [Theory], [TestMethod], or [Test] attribute."
            });
            return new DslDecompileResult { Dsl = CreateEmptyDefinition(), Diagnostics = _diagnostics };
        }

        var framework = _methodParser.DetectFramework(method);
        var (kind, ignore, timeoutMs, traits) = _methodParser.ExtractMethodMetadata(method, framework);
        var isAsync = method.Modifiers.Any(m => m.IsKind(SyntaxKind.AsyncKeyword));
        var name    = method.Identifier.Text;

        if (method.Body == null)
        {
            _diagnostics.Add(new DslDiagnostic
            {
                Code    = DslDiagnosticCodes.MissingAaaSections,
                Message = "Test method has no body."
            });
            return new DslDecompileResult { Dsl = CreateEmptyDefinition(), Diagnostics = _diagnostics };
        }

        var (arrangeStmts, actStmts, assertStmts) = _splitter.Split(method.Body);

        var bindings             = _arrangeParser.ParseArrangeBindings(arrangeStmts);
        var act                  = _actParser.ParseActSection(actStmts);
        var (retrievals, assertions) = _assertParser.ParseAssertSection(assertStmts);

        var dsl = new DslTestDefinition
        {
            DslVersion = "1.2",
            Language   = "csharp-aaa",
            Test = new DslTest
            {
                Framework = framework,
                Kind      = kind,
                Name      = name,
                Async     = isAsync,
                Traits    = traits?.Count > 0 ? traits : null,
                TimeoutMs = timeoutMs,
                Ignore    = ignore,
                Arrange   = new DslArrange { Bindings = bindings },
                Act       = act,
                Assert    = new DslAssert { Retrievals = retrievals, Assertions = assertions }
            }
        };

        return new DslDecompileResult { Dsl = dsl, Diagnostics = _diagnostics };
    }

    private static DslTestDefinition CreateEmptyDefinition() =>
        new()
        {
            Test = new DslTest
            {
                Framework = "xunit",
                Name      = "Unknown",
                Arrange   = new DslArrange(),
                Act       = new DslAct { Operation = new DslOperation { Kind = "create" } },
                Assert    = new DslAssert()
            }
        };
}
