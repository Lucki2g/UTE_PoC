using Microsoft.CodeAnalysis;
using Microsoft.CodeAnalysis.CSharp.Syntax;
using TestEngine.Models.Dsl;

namespace TestEngine.Services.DslCompiler;

/// <summary>
/// Handles both "AssociateEntities" and "DisassociateEntities" act operations.
/// Register two instances — one per normalized method name — in the orchestrator's constructor.
/// </summary>
internal sealed class RelationshipOperationParser : IActOperationParser
{
    private readonly ExpressionDecompiler _expr;
    private readonly string _kind;

    public RelationshipOperationParser(ExpressionDecompiler expr, string normalizedMethodName, string kind)
    {
        _expr = expr;
        NormalizedMethodName = normalizedMethodName;
        _kind = kind;
    }

    public string NormalizedMethodName { get; }

    public DslOperation Parse(
        SeparatedSyntaxList<ArgumentSyntax> args,
        string? genericType,
        bool awaited,
        bool unawaitedVariant)
    {
        string? relationshipName = null;
        DslValueExpression? target = null;
        DslValueExpression? related = null;

        if (args.Count >= 1 && args[0].Expression is LiteralExpressionSyntax relLit)
            relationshipName = relLit.Token.ValueText;
        if (args.Count >= 2) target  = _expr.DecompileExpression(args[1].Expression);
        if (args.Count >= 3) related = _expr.DecompileExpression(args[2].Expression);

        return new DslOperation
        {
            Kind             = _kind,
            RelationshipName = relationshipName,
            Target           = target,
            Related          = related != null ? new DslRelated { Kind = "single", Value = related } : null,
            Awaited          = awaited,
            UnawaitedVariant = unawaitedVariant
        };
    }
}
