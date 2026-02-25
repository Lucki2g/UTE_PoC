using Microsoft.CodeAnalysis;
using Microsoft.CodeAnalysis.CSharp;
using Microsoft.CodeAnalysis.CSharp.Syntax;
using TestEngine.Models.Dsl;

namespace TestEngine.Services.DslCompiler;

internal sealed class AaaSectionSplitter : DslSubcomponentBase
{
    public AaaSectionSplitter(List<DslDiagnostic> diagnostics) : base(diagnostics) { }

    public (List<StatementSyntax> arrange, List<StatementSyntax> act, List<StatementSyntax> assert)
        Split(BlockSyntax body)
    {
        var commentBased = TrySplitByComments(body);
        if (commentBased.HasValue) return commentBased.Value;
        return SplitByHeuristics(body);
    }

    private static (List<StatementSyntax> arrange, List<StatementSyntax> act, List<StatementSyntax> assert)?
        TrySplitByComments(BlockSyntax body)
    {
        var statements = body.Statements.ToList();
        int arrangeStart = -1, actStart = -1, assertStart = -1;

        for (int i = 0; i < statements.Count; i++)
        {
            foreach (var t in statements[i].GetLeadingTrivia())
            {
                if (!t.IsKind(SyntaxKind.SingleLineCommentTrivia)) continue;
                var comment = t.ToString().Trim();
                if (comment.Contains("Arrange", StringComparison.OrdinalIgnoreCase))
                    arrangeStart = i;
                else if (comment.Contains("Act", StringComparison.OrdinalIgnoreCase) &&
                         !comment.Contains("Arrange", StringComparison.OrdinalIgnoreCase) &&
                         !comment.Contains("Assert", StringComparison.OrdinalIgnoreCase))
                    actStart = i;
                else if (comment.Contains("Assert", StringComparison.OrdinalIgnoreCase))
                    assertStart = i;
            }
        }

        if (arrangeStart < 0 || actStart < 0 || assertStart < 0) return null;

        var arrange = statements.Skip(arrangeStart).Take(actStart - arrangeStart).ToList();
        var act     = statements.Skip(actStart).Take(assertStart - actStart).ToList();
        var assert  = statements.Skip(assertStart).ToList();

        return (arrange, act, assert);
    }

    private (List<StatementSyntax>, List<StatementSyntax>, List<StatementSyntax>)
        SplitByHeuristics(BlockSyntax body)
    {
        var statements = body.Statements.ToList();
        var arrange = new List<StatementSyntax>();
        var act     = new List<StatementSyntax>();
        var assert  = new List<StatementSyntax>();

        bool foundAct = false, foundAssert = false;

        foreach (var stmt in statements)
        {
            var text = stmt.ToString();

            if (!foundAct && !foundAssert)
            {
                if (IsAdminDaoNonRetrieve(text))
                {
                    foundAct = true;
                    act.Add(stmt);
                    continue;
                }
                arrange.Add(stmt);
            }
            else if (foundAct && !foundAssert)
            {
                foundAssert = true;
                assert.Add(stmt);
            }
            else
            {
                assert.Add(stmt);
            }
        }

        if (!foundAct)
        {
            AddDiagnostic(
                DslDiagnosticCodes.MissingAaaSections,
                "Could not identify the Act section via heuristics.");
        }

        return (arrange, act, assert);
    }

    private static bool IsAdminDaoNonRetrieve(string text) =>
        text.Contains("AdminDao.") && !text.Contains("AdminDao.Retrieve");
}
