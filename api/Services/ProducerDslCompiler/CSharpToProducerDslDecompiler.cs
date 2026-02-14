using Microsoft.CodeAnalysis;
using Microsoft.CodeAnalysis.CSharp;
using Microsoft.CodeAnalysis.CSharp.Syntax;
using TestEngine.Models.Dsl;

namespace TestEngine.Services;

internal class CSharpToProducerDslDecompiler
{
    private readonly List<DslDiagnostic> _diagnostics = [];

    public ProducerDslDecompileResult Decompile(string csharpCode)
    {
        var tree = CSharpSyntaxTree.ParseText(csharpCode);
        var root = tree.GetRoot();

        var classDecl = root.DescendantNodes()
            .OfType<ClassDeclarationSyntax>()
            .FirstOrDefault(c => c.Identifier.Text == "DataProducer");

        if (classDecl == null)
        {
            _diagnostics.Add(new DslDiagnostic
            {
                Code = ProducerDslDiagnosticCodes.NoDataProducerClass,
                Message = "No 'DataProducer' class found in the source."
            });
            return new ProducerDslDecompileResult
            {
                Dsl = new DslProducerDefinition(),
                Diagnostics = _diagnostics
            };
        }

        var methods = classDecl.Members.OfType<MethodDeclarationSyntax>();
        var drafts = new List<DslDraftDefinition>();

        foreach (var method in methods)
        {
            var draft = TryDecompileMethod(method);
            if (draft != null)
                drafts.Add(draft);
        }

        var dsl = new DslProducerDefinition
        {
            DslVersion = "1.0",
            Producer = "DataProducer",
            Drafts = drafts
        };

        return new ProducerDslDecompileResult { Dsl = dsl, Diagnostics = _diagnostics };
    }

    private DslDraftDefinition? TryDecompileMethod(MethodDeclarationSyntax method)
    {
        // Check return type is Draft<T>
        var returnType = method.ReturnType.ToString();
        if (!returnType.StartsWith("Draft<", StringComparison.Ordinal))
            return null;

        var entityName = ExtractGenericArgument(method.ReturnType);
        if (entityName == null)
        {
            _diagnostics.Add(new DslDiagnostic
            {
                Code = ProducerDslDiagnosticCodes.InvalidDraftSignature,
                Message = $"Could not extract generic type argument from return type '{returnType}' on method '{method.Identifier.Text}'."
            });
            return null;
        }

        if (method.Body == null)
            return null;

        // Verify the method follows the Draft pattern:
        // 1. param ??= new T();
        // 2. EnsureValue calls
        // 3. return new Draft<T>(this, param);
        var statements = method.Body.Statements.ToList();
        if (statements.Count < 2)
            return null;

        var accessModifier = ExtractAccessModifier(method);
        var rules = new List<DslDraftRule>();

        // Extract the parameter name for the entity variable
        var paramName = method.ParameterList.Parameters.FirstOrDefault()?.Identifier.Text;

        foreach (var stmt in statements)
        {
            // Skip the null-coalescing assignment: param ??= new T();
            if (IsNullCoalescingAssignment(stmt))
                continue;

            // Skip the return statement: return new Draft<T>(this, param);
            if (stmt is ReturnStatementSyntax)
                continue;

            // Try to parse EnsureValue calls
            var rule = TryParseEnsureValueStatement(stmt, method.Identifier.Text);
            if (rule != null)
                rules.Add(rule);
        }

        return new DslDraftDefinition
        {
            Id = method.Identifier.Text,
            Entity = new DslDraftEntity { LogicalName = entityName },
            AccessModifier = accessModifier,
            Rules = rules
        };
    }

    private DslDraftRule? TryParseEnsureValueStatement(StatementSyntax stmt, string methodName)
    {
        if (stmt is not ExpressionStatementSyntax exprStmt)
            return null;

        if (exprStmt.Expression is not InvocationExpressionSyntax invocation)
            return null;

        if (invocation.Expression is not MemberAccessExpressionSyntax memberAccess)
            return null;

        if (memberAccess.Name.Identifier.Text != "EnsureValue")
            return null;

        var args = invocation.ArgumentList.Arguments;
        if (args.Count < 2)
        {
            _diagnostics.Add(new DslDiagnostic
            {
                Code = ProducerDslDiagnosticCodes.UnsupportedEnsureValue,
                Message = $"EnsureValue call in '{methodName}' has fewer than 2 arguments.",
                Location = new DslDiagnosticLocation { Section = "rules", Hint = stmt.ToString().Trim() }
            });
            return null;
        }

        // First arg: lambda a => a.AttributeName
        var attribute = ExtractAttributeFromLambda(args[0].Expression);
        if (attribute == null)
        {
            _diagnostics.Add(new DslDiagnostic
            {
                Code = ProducerDslDiagnosticCodes.UnsupportedEnsureValue,
                Message = $"Could not extract attribute name from EnsureValue lambda in '{methodName}'.",
                Location = new DslDiagnosticLocation { Section = "rules", Hint = args[0].ToString() }
            });
            return null;
        }

        // Second arg: the value expression
        var value = DecompileValueExpression(args[1].Expression, methodName);
        if (value == null)
            return null;

        return new DslDraftRule
        {
            Type = "ensure",
            Attribute = attribute,
            Value = value
        };
    }

    private static string? ExtractAttributeFromLambda(ExpressionSyntax expr)
    {
        ExpressionSyntax? body = null;

        if (expr is SimpleLambdaExpressionSyntax simpleLambda)
            body = simpleLambda.Body as ExpressionSyntax;
        else if (expr is ParenthesizedLambdaExpressionSyntax parenLambda)
            body = parenLambda.Body as ExpressionSyntax;

        if (body is MemberAccessExpressionSyntax memberAccess)
            return memberAccess.Name.Identifier.Text;

        return null;
    }

    private DslDraftValue? DecompileValueExpression(ExpressionSyntax expr, string methodName)
    {
        // String literal: "value"
        if (expr is LiteralExpressionSyntax literal)
        {
            return literal.Kind() switch
            {
                SyntaxKind.StringLiteralExpression => new DslDraftConstantValue
                {
                    ValueType = "string",
                    Value = literal.Token.ValueText
                },
                SyntaxKind.NumericLiteralExpression => new DslDraftConstantValue
                {
                    ValueType = "number",
                    Value = literal.Token.Value!
                },
                SyntaxKind.TrueLiteralExpression => new DslDraftConstantValue
                {
                    ValueType = "boolean",
                    Value = true
                },
                SyntaxKind.FalseLiteralExpression => new DslDraftConstantValue
                {
                    ValueType = "boolean",
                    Value = false
                },
                _ => HandleUnsupportedValue(expr, methodName)
            };
        }

        // Enum member: EnumType.Member
        if (expr is MemberAccessExpressionSyntax enumAccess &&
            enumAccess.Expression is IdentifierNameSyntax enumType)
        {
            return new DslDraftEnumValue
            {
                EnumType = enumType.Identifier.Text,
                Value = enumAccess.Name.Identifier.Text
            };
        }

        // Lambda reference: () => DraftXxx(null).Build().ToEntityReference()
        if (expr is ParenthesizedLambdaExpressionSyntax lambdaRef)
        {
            return DecompileReferenceLambda(lambdaRef, methodName);
        }

        // Simple lambda reference: () => DraftXxx(null).Build().ToEntityReference()
        if (expr is SimpleLambdaExpressionSyntax simpleLambdaRef)
        {
            _diagnostics.Add(new DslDiagnostic
            {
                Code = ProducerDslDiagnosticCodes.UnsupportedEnsureValue,
                Message = $"Unsupported simple lambda expression in EnsureValue in '{methodName}': {expr}",
                Location = new DslDiagnosticLocation { Section = "rules", Hint = expr.ToString() }
            });
            return null;
        }

        return HandleUnsupportedValue(expr, methodName);
    }

    private DslDraftValue? DecompileReferenceLambda(ParenthesizedLambdaExpressionSyntax lambda, string methodName)
    {
        // Expected shape: () => DraftXxx(null).Build().ToEntityReference()
        var body = lambda.Body as ExpressionSyntax;
        if (body == null)
            return HandleUnsupportedValue(lambda, methodName);

        // Walk the invocation chain from outside in
        string? draftMethodName = null;
        var hasBuild = false;
        string? transform = null;

        var current = body;
        while (current is InvocationExpressionSyntax invocation)
        {
            if (invocation.Expression is MemberAccessExpressionSyntax memberAccess)
            {
                var name = memberAccess.Name.Identifier.Text;

                if (name == "ToEntityReference" || name == "ToEntityReferenceWithKeys")
                {
                    transform = name;
                    current = memberAccess.Expression;
                    continue;
                }

                if (name == "Build")
                {
                    hasBuild = true;
                    current = memberAccess.Expression;
                    continue;
                }

                // This should be the draft method call: DraftXxx(null) or this.DraftXxx(null)
                draftMethodName = name;
                break;
            }
            else if (invocation.Expression is IdentifierNameSyntax identifier)
            {
                // Direct call: DraftXxx(null)
                draftMethodName = identifier.Identifier.Text;
                break;
            }
            else
            {
                break;
            }
        }

        if (draftMethodName == null)
            return HandleUnsupportedValue(lambda, methodName);

        var isSelfReference = draftMethodName == methodName;

        return new DslDraftReferenceValue
        {
            Draft = draftMethodName,
            Self = isSelfReference,
            Build = hasBuild,
            Transform = transform
        };
    }

    private DslDraftValue? HandleUnsupportedValue(ExpressionSyntax expr, string methodName)
    {
        _diagnostics.Add(new DslDiagnostic
        {
            Code = ProducerDslDiagnosticCodes.UnsupportedEnsureValue,
            Message = $"Unsupported value expression in EnsureValue in '{methodName}': {expr}",
            Location = new DslDiagnosticLocation { Section = "rules", Hint = expr.ToString() }
        });
        return null;
    }

    private static string? ExtractGenericArgument(TypeSyntax returnType)
    {
        if (returnType is GenericNameSyntax genericName &&
            genericName.TypeArgumentList.Arguments.Count == 1)
        {
            return genericName.TypeArgumentList.Arguments[0].ToString();
        }

        // Fallback: parse from string "Draft<ape_skill>"
        var text = returnType.ToString();
        var start = text.IndexOf('<');
        var end = text.LastIndexOf('>');
        if (start >= 0 && end > start)
            return text[(start + 1)..end];

        return null;
    }

    private static string ExtractAccessModifier(MethodDeclarationSyntax method)
    {
        foreach (var modifier in method.Modifiers)
        {
            var text = modifier.Text;
            if (text is "public" or "private" or "protected" or "internal")
                return text;
        }
        return "internal";
    }

    private static bool IsNullCoalescingAssignment(StatementSyntax stmt)
    {
        if (stmt is ExpressionStatementSyntax exprStmt &&
            exprStmt.Expression is AssignmentExpressionSyntax assignment &&
            assignment.IsKind(SyntaxKind.CoalesceAssignmentExpression))
        {
            return true;
        }
        return false;
    }
}
