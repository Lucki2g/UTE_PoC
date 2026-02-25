using Microsoft.CodeAnalysis.CSharp;
using Microsoft.CodeAnalysis.CSharp.Syntax;
using TestEngine.Models.Dsl;

namespace TestEngine.Services.DslCompiler;

internal sealed class ExpressionDecompiler : DslSubcomponentBase
{
    public ExpressionDecompiler(List<DslDiagnostic> diagnostics) : base(diagnostics) { }

    public DslValueExpression DecompileExpression(ExpressionSyntax expr)
    {
        // String / number / boolean / null literals
        if (expr is LiteralExpressionSyntax literal)
        {
            return literal.Kind() switch
            {
                SyntaxKind.StringLiteralExpression  => new DslStringValue { Value = literal.Token.ValueText },
                SyntaxKind.NumericLiteralExpression => new DslNumberValue { Value = Convert.ToDouble(literal.Token.Value) },
                SyntaxKind.TrueLiteralExpression    => new DslBooleanValue { Value = true },
                SyntaxKind.FalseLiteralExpression   => new DslBooleanValue { Value = false },
                SyntaxKind.NullLiteralExpression    => new DslNullValue(),
                _                                   => new DslStringValue { Value = literal.Token.ValueText }
            };
        }

        // Interpolated string: $"..."
        if (expr is InterpolatedStringExpressionSyntax interpolated)
            return DecompileInterpolatedString(interpolated);

        // new Guid("...")
        if (expr is ObjectCreationExpressionSyntax objCreation &&
            objCreation.Type.ToString() == "Guid" &&
            objCreation.ArgumentList?.Arguments.Count > 0 &&
            objCreation.ArgumentList.Arguments[0].Expression is LiteralExpressionSyntax guidLiteral)
        {
            return new DslGuidValue { Value = guidLiteral.Token.ValueText };
        }

        // Enum cast: (EnumType)123
        if (expr is CastExpressionSyntax castExpr &&
            castExpr.Expression is LiteralExpressionSyntax castLiteral &&
            castLiteral.Kind() == SyntaxKind.NumericLiteralExpression)
        {
            return new DslEnumNumberValue
            {
                EnumType = castExpr.Type.ToString(),
                Value = Convert.ToInt32(castLiteral.Token.Value)
            };
        }

        // Member access: EnumType.Member or binding.Property
        if (expr is MemberAccessExpressionSyntax memberAccess)
            return DecompileMemberAccess(memberAccess);

        // Invocation: binding.ToEntityReference()
        if (expr is InvocationExpressionSyntax invocation &&
            invocation.Expression is MemberAccessExpressionSyntax invokeAccess)
        {
            var id = invokeAccess.Expression.ToString();
            var call = invokeAccess.Name.Identifier.Text;
            return new DslRefValue { Ref = new DslRefExpr { Kind = "bindingVar", Id = id, Call = call } };
        }

        // Simple identifier: variable reference
        if (expr is IdentifierNameSyntax identifier)
            return new DslRefValue { Ref = new DslRefExpr { Kind = "bindingVar", Id = identifier.Identifier.Text } };

        // Fallback
        return new DslStringValue { Value = expr.ToString() };
    }

    private DslValueExpression DecompileMemberAccess(MemberAccessExpressionSyntax memberAccess)
    {
        var left = memberAccess.Expression.ToString();
        var right = memberAccess.Name.Identifier.Text;

        // Strong enum signal: left contains underscore (e.g. Account_CustomerTypeCode.Customer)
        if (!left.Contains('.') && char.IsUpper(left[0]) && char.IsUpper(right[0]) && left.Contains('_'))
            return new DslEnumValue { EnumType = left, Member = right };

        // Weaker heuristic: both sides PascalCase, no dots in left
        if (!left.Contains('.') && char.IsUpper(left[0]) && char.IsUpper(right[0]))
            return new DslEnumValue { EnumType = left, Member = right };

        // Otherwise it's a binding member reference
        return new DslRefValue { Ref = new DslRefExpr { Kind = "bindingVar", Id = left, Member = right } };
    }

    private static DslInterpolationValue DecompileInterpolatedString(InterpolatedStringExpressionSyntax interpolated)
    {
        var template = new System.Text.StringBuilder();

        foreach (var content in interpolated.Contents)
        {
            if (content is InterpolatedStringTextSyntax text)
                template.Append(text.TextToken.ValueText);
            else if (content is InterpolationSyntax interpolation)
            {
                template.Append("${");
                template.Append(interpolation.Expression.ToString());
                template.Append('}');
            }
        }

        return new DslInterpolationValue { Template = template.ToString() };
    }
}
