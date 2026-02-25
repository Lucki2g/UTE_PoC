using Microsoft.CodeAnalysis;
using Microsoft.CodeAnalysis.CSharp.Syntax;
using TestEngine.Models.Dsl;

namespace TestEngine.Services.DslCompiler;

internal sealed class CreateOperationParser : IActOperationParser
{
    public string NormalizedMethodName => "Create";

    public DslOperation Parse(
        SeparatedSyntaxList<ArgumentSyntax> args,
        string? genericType,
        bool awaited,
        bool unawaitedVariant)
    {
        return new DslOperation
        {
            Kind             = "create",
            GenericType      = genericType ?? InferGenericType(args),
            Entity           = ParseEntityArg(args),
            Awaited          = awaited,
            UnawaitedVariant = unawaitedVariant
        };
    }

    private static DslEntityRef? ParseEntityArg(SeparatedSyntaxList<ArgumentSyntax> args)
    {
        if (args.Count == 0) return null;
        var expr = args[0].Expression;
        if (expr is MemberAccessExpressionSyntax memberAccess)
        {
            return new DslEntityRef
            {
                FromBinding = memberAccess.Expression.ToString(),
                Member      = memberAccess.Name.Identifier.Text
            };
        }
        return new DslEntityRef { FromBinding = expr.ToString(), Member = "Entity" };
    }

    private static string? InferGenericType(SeparatedSyntaxList<ArgumentSyntax> args)
    {
        if (args.Count > 0 && args[0].Expression is MemberAccessExpressionSyntax ma)
        {
            var bindingName = ma.Expression.ToString();
            if (bindingName.Length > 0)
                return char.ToUpper(bindingName[0]) + bindingName[1..];
        }
        return null;
    }
}
