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
        // Only process methods returning Draft<T>
        var returnType = method.ReturnType.ToString();
        if (!returnType.StartsWith("Draft<", StringComparison.Ordinal))
            return null;

        var entityName = ExtractGenericArgument(method.ReturnType);
        if (entityName == null)
        {
            _diagnostics.Add(new DslDiagnostic
            {
                Code = ProducerDslDiagnosticCodes.InvalidDraftSignature,
                Message = $"Could not extract entity type from return type '{returnType}' on method '{method.Identifier.Text}'."
            });
            return null;
        }

        if (method.Body == null)
            return null;

        var accessModifier = ExtractAccessModifier(method);
        var statements = method.Body.Statements.ToList();

        // Collect Ref declarations: var alias = Ref(DraftXxx);
        var refAliasMap = ExtractRefDeclarations(statements);
        var rules = new List<DslDraftRule>();

        // Emit explicit "ref" rules for each Ref declaration (alias -> draft)
        foreach (var stmt in statements)
        {
            if (!IsRefDeclaration(stmt)) continue;
            if (stmt is not LocalDeclarationStatementSyntax localDecl) continue;
            foreach (var variable in localDecl.Declaration.Variables)
            {
                if (variable.Initializer?.Value is not InvocationExpressionSyntax inv) continue;
                if (GetSimpleMethodName(inv) != "Ref") continue;
                var args = inv.ArgumentList.Arguments;
                if (args.Count != 1) continue;
                if (args[0].Expression is IdentifierNameSyntax draftId)
                {
                    rules.Add(new DslDraftRule
                    {
                        Type = "ref",
                        Draft = draftId.Identifier.Text,
                        Alias = variable.Identifier.Text
                    });
                }
            }
        }

        foreach (var stmt in statements)
        {
            if (IsRefDeclaration(stmt))
                continue;

            if (stmt is ReturnStatementSyntax returnStmt)
            {
                var returnRules = DecompileReturnStatement(returnStmt, method.Identifier.Text, refAliasMap);
                rules.AddRange(returnRules);
            }
        }

        return new DslDraftDefinition
        {
            Id = method.Identifier.Text,
            Entity = new DslDraftEntity { LogicalName = entityName },
            AccessModifier = accessModifier,
            Rules = rules
        };
    }

    /// <summary>
    /// Scans statements for: var alias = Ref(DraftXxx);
    /// Returns mapping alias -> draftMethodName.
    /// </summary>
    private static Dictionary<string, string> ExtractRefDeclarations(List<StatementSyntax> statements)
    {
        var map = new Dictionary<string, string>();
        foreach (var stmt in statements)
        {
            if (stmt is not LocalDeclarationStatementSyntax localDecl)
                continue;

            foreach (var variable in localDecl.Declaration.Variables)
            {
                if (variable.Initializer?.Value is not InvocationExpressionSyntax invocation)
                    continue;

                var name = GetSimpleMethodName(invocation);
                if (name != "Ref") continue;

                var args = invocation.ArgumentList.Arguments;
                if (args.Count != 1) continue;

                // Ref(DraftXxx) — argument is a method group identifier
                if (args[0].Expression is IdentifierNameSyntax draftId)
                    map[variable.Identifier.Text] = draftId.Identifier.Text;
            }
        }
        return map;
    }

    private static bool IsRefDeclaration(StatementSyntax stmt)
    {
        if (stmt is not LocalDeclarationStatementSyntax localDecl)
            return false;

        foreach (var variable in localDecl.Declaration.Variables)
        {
            if (variable.Initializer?.Value is InvocationExpressionSyntax invocation &&
                GetSimpleMethodName(invocation) == "Ref")
            {
                return true;
            }
        }
        return false;
    }

    private List<DslDraftRule> DecompileReturnStatement(ReturnStatementSyntax returnStmt,
        string methodName, Dictionary<string, string> refAliasMap)
    {
        var rules = new List<DslDraftRule>();
        if (returnStmt.Expression == null)
            return rules;

        // Flatten the fluent chain: new Draft<T>(this).With(...).WithDefault(...)
        var chain = FlattenInvocationChain(returnStmt.Expression);

        foreach (var (callName, argList) in chain)
        {
            if (callName == "With")
            {
                var rule = ParseWithCall(argList, methodName);
                if (rule != null) rules.Add(rule);
            }
            else if (callName == "WithDefault")
            {
                var rule = ParseWithDefaultCall(argList, methodName, refAliasMap);
                if (rule != null) rules.Add(rule);
            }
        }

        return rules;
    }

    /// <summary>
    /// Flattens a fluent invocation chain into ordered (methodName, argumentList) pairs.
    /// </summary>
    private static List<(string MethodName, ArgumentListSyntax Args)> FlattenInvocationChain(ExpressionSyntax expr)
    {
        var chain = new List<(string, ArgumentListSyntax)>();
        CollectChainItems(expr, chain);
        return chain;
    }

    private static void CollectChainItems(ExpressionSyntax expr,
        List<(string, ArgumentListSyntax)> chain)
    {
        if (expr is InvocationExpressionSyntax invocation &&
            invocation.Expression is MemberAccessExpressionSyntax memberAccess)
        {
            CollectChainItems(memberAccess.Expression, chain);
            chain.Add((memberAccess.Name.Identifier.Text, invocation.ArgumentList));
        }
        // ObjectCreationExpression or anything else: base case
    }

    private DslDraftRule? ParseWithCall(ArgumentListSyntax argList, string methodName)
    {
        var args = argList.Arguments;
        if (args.Count < 1)
        {
            AddDiagnostic($"With() call in '{methodName}' has no arguments.", argList.ToString());
            return null;
        }

        var (attribute, valueExpr) = ExtractAttributeAndValue(args[0].Expression);
        if (attribute == null || valueExpr == null)
        {
            AddDiagnostic($"Could not parse With() assignment lambda in '{methodName}'.", args[0].ToString());
            return null;
        }

        var value = DecompileValue(valueExpr, methodName, refAliasMap: null);
        if (value == null) return null;

        return new DslDraftRule { Type = "with", Attribute = attribute, Value = value };
    }

    private DslDraftRule? ParseWithDefaultCall(ArgumentListSyntax argList, string methodName,
        Dictionary<string, string> refAliasMap)
    {
        var args = argList.Arguments;
        if (args.Count < 2)
        {
            AddDiagnostic($"WithDefault() call in '{methodName}' has fewer than 2 arguments.", argList.ToString());
            return null;
        }

        var attribute = ExtractAttributeFromSelector(args[0].Expression);
        if (attribute == null)
        {
            AddDiagnostic($"Could not extract attribute from WithDefault() selector in '{methodName}'.", args[0].ToString());
            return null;
        }

        var value = DecompileWithDefaultFactory(args[1].Expression, methodName, refAliasMap);
        if (value == null) return null;

        return new DslDraftRule { Type = "withDefault", Attribute = attribute, Value = value };
    }

    private DslDraftValue? DecompileWithDefaultFactory(ExpressionSyntax factory, string methodName,
        Dictionary<string, string> refAliasMap)
    {
        // Method group shorthand: DraftValidB  (implies .Build().ToEntityReference())
        if (factory is IdentifierNameSyntax methodGroupId)
        {
            return new DslDraftReferenceValue
            {
                Draft = methodGroupId.Identifier.Text,
                Build = true,
                Transform = "ToEntityReference"
            };
        }

        // Lambda: () => body
        if (factory is ParenthesizedLambdaExpressionSyntax lambda &&
            lambda.Body is ExpressionSyntax lambdaBody)
        {
            return DecompileValue(lambdaBody, methodName, refAliasMap);
        }

        AddDiagnostic($"Unsupported WithDefault factory in '{methodName}'.", factory.ToString());
        return null;
    }

    private DslDraftValue? DecompileValue(ExpressionSyntax expr, string methodName,
        Dictionary<string, string>? refAliasMap)
    {
        // Literal: string/number/bool
        if (expr is LiteralExpressionSyntax literal)
        {
            return literal.Kind() switch
            {
                SyntaxKind.StringLiteralExpression => new DslDraftConstantValue
                    { ValueType = "string", Value = literal.Token.ValueText },
                SyntaxKind.NumericLiteralExpression => new DslDraftConstantValue
                    { ValueType = "number", Value = literal.Token.Value! },
                SyntaxKind.TrueLiteralExpression => new DslDraftConstantValue
                    { ValueType = "boolean", Value = true },
                SyntaxKind.FalseLiteralExpression => new DslDraftConstantValue
                    { ValueType = "boolean", Value = false },
                _ => HandleUnsupported(expr, methodName)
            };
        }

        // MemberAccess: EnumType.Member  OR  alias.Value (from Ref)
        if (expr is MemberAccessExpressionSyntax memberAccess &&
            memberAccess.Expression is IdentifierNameSyntax leftId)
        {
            var rightName = memberAccess.Name.Identifier.Text;

            // Check if left side is a Ref alias: alias.Value or alias.SomeProperty
            if (refAliasMap != null && refAliasMap.TryGetValue(leftId.Identifier.Text, out var draftFromAlias))
            {
                return new DslDraftReferenceValue
                {
                    Draft = draftFromAlias,
                    Build = true,
                    Transform = rightName == "Value" ? null : rightName,
                    RefAlias = leftId.Identifier.Text
                };
            }

            // Enum: EnumType.Member
            return new DslDraftEnumValue
            {
                EnumType = leftId.Identifier.Text,
                Value = rightName
            };
        }

        // Invocation chain: DraftXxx().Build().ToEntityReference() or alias.Value.Transform()
        if (expr is InvocationExpressionSyntax invocation)
        {
            return DecompileInvocationChain(invocation, methodName, refAliasMap);
        }

        return HandleUnsupported(expr, methodName);
    }

    private DslDraftValue? DecompileInvocationChain(InvocationExpressionSyntax expr, string methodName,
        Dictionary<string, string>? refAliasMap)
    {
        string? draftMethodName = null;
        var hasBuild = false;
        string? transform = null;
        var isFromRef = false;
        string? refAliasName = null;

        ExpressionSyntax current = expr;

        while (current is InvocationExpressionSyntax invocation)
        {
            if (invocation.Expression is MemberAccessExpressionSyntax memberAccess)
            {
                var name = memberAccess.Name.Identifier.Text;

                if (name is "ToEntityReference" or "ToEntityReferenceWithKeys")
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

                // Could be: alias.Value (where alias is a Ref variable)
                // In that case memberAccess.Expression would be something like "alias" and name would be "Value"
                if (name == "Value" && memberAccess.Expression is IdentifierNameSyntax aliasId2 &&
                    refAliasMap != null && refAliasMap.TryGetValue(aliasId2.Identifier.Text, out var draftFromAlias2))
                {
                    draftMethodName = draftFromAlias2;
                    isFromRef = true;
                    refAliasName = aliasId2.Identifier.Text;
                    break;
                }

                draftMethodName = name;
                break;
            }
            else if (invocation.Expression is IdentifierNameSyntax identifier)
            {
                draftMethodName = identifier.Identifier.Text;
                break;
            }
            else
            {
                break;
            }
        }

        // Handle alias.Value (MemberAccess, not invocation at this level)
        if (draftMethodName == null && current is MemberAccessExpressionSyntax outerMember)
        {
            if (outerMember.Name.Identifier.Text == "Value" &&
                outerMember.Expression is IdentifierNameSyntax aliasId &&
                refAliasMap != null && refAliasMap.TryGetValue(aliasId.Identifier.Text, out var draftFromRefAlias))
            {
                draftMethodName = draftFromRefAlias;
                isFromRef = true;
                refAliasName = aliasId.Identifier.Text;
            }
        }

        if (draftMethodName == null)
            return HandleUnsupported(expr, methodName);

        var isSelf = draftMethodName == methodName;
        return new DslDraftReferenceValue
        {
            Draft = draftMethodName,
            Self = isSelf,
            Build = hasBuild,
            Transform = transform,
            RefAlias = isFromRef ? refAliasName : null
        };
    }

    private static (string? Attribute, ExpressionSyntax? ValueExpr) ExtractAttributeAndValue(
        ExpressionSyntax lambdaExpr)
    {
        ExpressionSyntax? body = null;

        if (lambdaExpr is SimpleLambdaExpressionSyntax simple)
            body = simple.Body as ExpressionSyntax;
        else if (lambdaExpr is ParenthesizedLambdaExpressionSyntax paren)
            body = paren.Body as ExpressionSyntax;

        if (body is AssignmentExpressionSyntax assignment &&
            assignment.Left is MemberAccessExpressionSyntax memberAccess)
        {
            return (memberAccess.Name.Identifier.Text, assignment.Right);
        }

        return (null, null);
    }

    private static string? ExtractAttributeFromSelector(ExpressionSyntax lambdaExpr)
    {
        ExpressionSyntax? body = null;

        if (lambdaExpr is SimpleLambdaExpressionSyntax simple)
            body = simple.Body as ExpressionSyntax;
        else if (lambdaExpr is ParenthesizedLambdaExpressionSyntax paren)
            body = paren.Body as ExpressionSyntax;

        if (body is MemberAccessExpressionSyntax memberAccess)
            return memberAccess.Name.Identifier.Text;

        return null;
    }

    private static string? GetSimpleMethodName(InvocationExpressionSyntax invocation)
    {
        if (invocation.Expression is IdentifierNameSyntax id)
            return id.Identifier.Text;
        if (invocation.Expression is MemberAccessExpressionSyntax member)
            return member.Name.Identifier.Text;
        return null;
    }

    private DslDraftValue? HandleUnsupported(ExpressionSyntax expr, string methodName)
    {
        AddDiagnostic($"Unsupported expression in '{methodName}': {expr}", expr.ToString());
        return null;
    }

    private void AddDiagnostic(string message, string hint)
    {
        _diagnostics.Add(new DslDiagnostic
        {
            Code = ProducerDslDiagnosticCodes.UnsupportedEnsureValue,
            Message = message,
            Location = new DslDiagnosticLocation { Section = "rules", Hint = hint }
        });
    }

    private static string? ExtractGenericArgument(TypeSyntax returnType)
    {
        if (returnType is GenericNameSyntax genericName &&
            genericName.TypeArgumentList.Arguments.Count == 1)
        {
            return genericName.TypeArgumentList.Arguments[0].ToString();
        }

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
}
