using Microsoft.CodeAnalysis;
using Microsoft.CodeAnalysis.CSharp.Syntax;
using TestEngine.Models.Dsl;

namespace TestEngine.Services.DslCompiler;

internal sealed class DeleteOperationParser : IActOperationParser
{
    private readonly ExpressionDecompiler _expr;

    public DeleteOperationParser(ExpressionDecompiler expr)
    {
        _expr = expr;
    }

    public string NormalizedMethodName => "Delete";

    public DslOperation Parse(
        SeparatedSyntaxList<ArgumentSyntax> args,
        string? genericType,
        bool awaited,
        bool unawaitedVariant)
    {
        return new DslOperation
        {
            Kind             = "delete",
            GenericType      = genericType,
            Id               = args.Count > 0 ? _expr.DecompileExpression(args[0].Expression) : null,
            Awaited          = awaited,
            UnawaitedVariant = unawaitedVariant
        };
    }
}
