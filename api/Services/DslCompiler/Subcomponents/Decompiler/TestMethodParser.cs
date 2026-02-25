using Microsoft.CodeAnalysis;
using Microsoft.CodeAnalysis.CSharp;
using Microsoft.CodeAnalysis.CSharp.Syntax;
using TestEngine.Models.Dsl;

namespace TestEngine.Services.DslCompiler;

internal sealed class TestMethodParser : DslSubcomponentBase
{
    public TestMethodParser(List<DslDiagnostic> diagnostics) : base(diagnostics) { }

    public MethodDeclarationSyntax? FindTestMethod(SyntaxNode root)
    {
        var methods = root.DescendantNodes().OfType<MethodDeclarationSyntax>();
        foreach (var method in methods)
        {
            var attrs = method.AttributeLists
                .SelectMany(al => al.Attributes)
                .Select(a => a.Name.ToString());

            if (attrs.Any(a => a is "Fact" or "Theory" or "TestMethod" or "Test"))
                return method;
        }
        return null;
    }

    public string DetectFramework(MethodDeclarationSyntax method)
    {
        var attrs = method.AttributeLists
            .SelectMany(al => al.Attributes)
            .Select(a => a.Name.ToString())
            .ToList();

        if (attrs.Any(a => a is "Fact" or "Theory")) return "xunit";
        if (attrs.Any(a => a == "TestMethod")) return "mstest";
        if (attrs.Any(a => a == "Test")) return "nunit";

        AddDiagnostic(
            DslDiagnosticCodes.AmbiguousTestFramework,
            "Could not determine test framework from attributes. Defaulting to xunit.");
        return "xunit";
    }

    public (string kind, DslIgnore? ignore, int? timeoutMs, Dictionary<string, List<string>>? traits)
        ExtractMethodMetadata(MethodDeclarationSyntax method, string framework)
    {
        var kind = "test";
        DslIgnore? ignore = null;
        int? timeoutMs = null;
        var traits = new Dictionary<string, List<string>>();

        foreach (var attr in method.AttributeLists.SelectMany(al => al.Attributes))
        {
            var attrName = attr.Name.ToString();

            switch (attrName)
            {
                case "Theory":
                    kind = "theory";
                    break;

                case "Fact" or "Theory" when attr.ArgumentList != null:
                    foreach (var arg in attr.ArgumentList.Arguments)
                    {
                        if (arg.NameEquals?.Name.ToString() == "Skip" &&
                            arg.Expression is LiteralExpressionSyntax skipLiteral)
                        {
                            ignore = new DslIgnore { Reason = skipLiteral.Token.ValueText };
                        }
                    }
                    break;

                case "Ignore" when attr.ArgumentList?.Arguments.Count > 0:
                    var firstArg = attr.ArgumentList.Arguments[0].Expression;
                    if (firstArg is LiteralExpressionSyntax ignoreLiteral)
                        ignore = new DslIgnore { Reason = ignoreLiteral.Token.ValueText };
                    break;

                case "Timeout" when attr.ArgumentList?.Arguments.Count > 0:
                    var timeoutArg = attr.ArgumentList.Arguments[0].Expression;
                    if (timeoutArg is LiteralExpressionSyntax timeoutLiteral &&
                        int.TryParse(timeoutLiteral.Token.ValueText, out var ms))
                        timeoutMs = ms;
                    break;

                case "Trait" when attr.ArgumentList?.Arguments.Count >= 2:
                    if (attr.ArgumentList.Arguments[0].Expression is LiteralExpressionSyntax traitKey &&
                        attr.ArgumentList.Arguments[1].Expression is LiteralExpressionSyntax traitVal)
                    {
                        var key = traitKey.Token.ValueText;
                        var val = traitVal.Token.ValueText;
                        if (!traits.ContainsKey(key)) traits[key] = [];
                        traits[key].Add(val);
                    }
                    break;

                case "TestCategory" when attr.ArgumentList?.Arguments.Count > 0:
                    if (attr.ArgumentList.Arguments[0].Expression is LiteralExpressionSyntax catVal)
                    {
                        if (!traits.ContainsKey("category")) traits["category"] = [];
                        traits["category"].Add(catVal.Token.ValueText);
                    }
                    break;

                case "Category" when attr.ArgumentList?.Arguments.Count > 0:
                    if (attr.ArgumentList.Arguments[0].Expression is LiteralExpressionSyntax nCatVal)
                    {
                        if (!traits.ContainsKey("category")) traits["category"] = [];
                        traits["category"].Add(nCatVal.Token.ValueText);
                    }
                    break;
            }
        }

        return (kind, ignore, timeoutMs, traits);
    }
}
