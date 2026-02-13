using Microsoft.CodeAnalysis;
using Microsoft.CodeAnalysis.CSharp;
using Microsoft.CodeAnalysis.CSharp.Syntax;
using TestEngine.Models.Dsl;

namespace TestEngine.Services;

internal class CSharpToDslDecompiler
{
    private readonly List<DslDiagnostic> _diagnostics = [];

    public DslDecompileResult Decompile(string csharpCode)
    {
        var tree = CSharpSyntaxTree.ParseText(csharpCode);
        var root = tree.GetRoot();

        var method = FindTestMethod(root);
        if (method == null)
        {
            _diagnostics.Add(new DslDiagnostic
            {
                Code = DslDiagnosticCodes.MissingAaaSections,
                Message = "No test method found with [Fact], [Theory], [TestMethod], or [Test] attribute."
            });
            return new DslDecompileResult
            {
                Dsl = CreateEmptyDefinition(),
                Diagnostics = _diagnostics
            };
        }

        var framework = DetectFramework(method);
        var (kind, ignore, timeoutMs, traits) = ExtractMethodMetadata(method, framework);
        var isAsync = method.Modifiers.Any(SyntaxKind.AsyncKeyword);
        var name = method.Identifier.Text;

        if (method.Body == null)
        {
            _diagnostics.Add(new DslDiagnostic
            {
                Code = DslDiagnosticCodes.MissingAaaSections,
                Message = "Test method has no body."
            });
            return new DslDecompileResult
            {
                Dsl = CreateEmptyDefinition(),
                Diagnostics = _diagnostics
            };
        }

        var (arrangeStmts, actStmts, assertStmts) = SplitAaaSections(method.Body);

        var bindings = ParseArrangeBindings(arrangeStmts);
        var act = ParseActSection(actStmts);
        var (retrievals, assertions) = ParseAssertSection(assertStmts);

        var dsl = new DslTestDefinition
        {
            DslVersion = "1.2",
            Language = "csharp-aaa",
            Test = new DslTest
            {
                Framework = framework,
                Kind = kind,
                Name = name,
                Async = isAsync,
                Traits = traits?.Count > 0 ? traits : null,
                TimeoutMs = timeoutMs,
                Ignore = ignore,
                Arrange = new DslArrange { Bindings = bindings },
                Act = act,
                Assert = new DslAssert { Retrievals = retrievals, Assertions = assertions }
            }
        };

        return new DslDecompileResult { Dsl = dsl, Diagnostics = _diagnostics };
    }

    // --- Test Method Detection ---

    private static MethodDeclarationSyntax? FindTestMethod(SyntaxNode root)
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

    private string DetectFramework(MethodDeclarationSyntax method)
    {
        var attrs = method.AttributeLists
            .SelectMany(al => al.Attributes)
            .Select(a => a.Name.ToString())
            .ToList();

        if (attrs.Any(a => a is "Fact" or "Theory")) return "xunit";
        if (attrs.Any(a => a == "TestMethod")) return "mstest";
        if (attrs.Any(a => a == "Test")) return "nunit";

        _diagnostics.Add(new DslDiagnostic
        {
            Code = DslDiagnosticCodes.AmbiguousTestFramework,
            Message = "Could not determine test framework from attributes. Defaulting to xunit."
        });
        return "xunit";
    }

    private (string kind, DslIgnore? ignore, int? timeoutMs, Dictionary<string, List<string>>? traits)
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
                    // Check for Skip parameter: [Fact(Skip = "reason")]
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
                    // MSTest/NUnit [Ignore("reason")]
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
                    // xUnit [Trait("Category", "smoke")]
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
                    // MSTest [TestCategory("smoke")]
                    if (attr.ArgumentList.Arguments[0].Expression is LiteralExpressionSyntax catVal)
                    {
                        if (!traits.ContainsKey("category")) traits["category"] = [];
                        traits["category"].Add(catVal.Token.ValueText);
                    }
                    break;

                case "Category" when attr.ArgumentList?.Arguments.Count > 0:
                    // NUnit [Category("smoke")]
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

    // --- AAA Section Splitting ---

    private (List<StatementSyntax> arrange, List<StatementSyntax> act, List<StatementSyntax> assert)
        SplitAaaSections(BlockSyntax body)
    {
        // Try comment-based splitting first
        var commentBased = TrySplitByComments(body);
        if (commentBased.HasValue) return commentBased.Value;

        // Fallback: heuristic-based
        return SplitByHeuristics(body);
    }

    private (List<StatementSyntax> arrange, List<StatementSyntax> act, List<StatementSyntax> assert)?
        TrySplitByComments(BlockSyntax body)
    {
        var statements = body.Statements.ToList();
        int arrangeStart = -1, actStart = -1, assertStart = -1;

        for (int i = 0; i < statements.Count; i++)
        {
            var trivia = statements[i].GetLeadingTrivia();
            foreach (var t in trivia)
            {
                if (t.IsKind(SyntaxKind.SingleLineCommentTrivia))
                {
                    var comment = t.ToString().Trim();
                    if (comment.Contains("Arrange", StringComparison.OrdinalIgnoreCase)) arrangeStart = i;
                    else if (comment.Contains("Act", StringComparison.OrdinalIgnoreCase) &&
                             !comment.Contains("Arrange", StringComparison.OrdinalIgnoreCase) &&
                             !comment.Contains("Assert", StringComparison.OrdinalIgnoreCase)) actStart = i;
                    else if (comment.Contains("Assert", StringComparison.OrdinalIgnoreCase)) assertStart = i;
                }
            }
        }

        if (arrangeStart < 0 || actStart < 0 || assertStart < 0)
            return null;

        var arrange = statements.Skip(arrangeStart).Take(actStart - arrangeStart).ToList();
        var act = statements.Skip(actStart).Take(assertStart - actStart).ToList();
        var assert = statements.Skip(assertStart).ToList();

        return (arrange, act, assert);
    }

    private (List<StatementSyntax>, List<StatementSyntax>, List<StatementSyntax>) SplitByHeuristics(BlockSyntax body)
    {
        var statements = body.Statements.ToList();
        var arrange = new List<StatementSyntax>();
        var act = new List<StatementSyntax>();
        var assert = new List<StatementSyntax>();

        bool foundAct = false, foundAssert = false;

        foreach (var stmt in statements)
        {
            var text = stmt.ToString();

            if (!foundAct && !foundAssert)
            {
                // Check if this is an Act statement (AdminDao non-Retrieve call)
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
                // After Act, everything is Assert
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
            _diagnostics.Add(new DslDiagnostic
            {
                Code = DslDiagnosticCodes.MissingAaaSections,
                Message = "Could not identify the Act section via heuristics."
            });
        }

        return (arrange, act, assert);
    }

    private static bool IsAdminDaoNonRetrieve(string text)
    {
        return text.Contains("AdminDao.") &&
               !text.Contains("AdminDao.Retrieve");
    }

    // --- Arrange Parsing ---

    private List<DslBinding> ParseArrangeBindings(List<StatementSyntax> statements)
    {
        var bindings = new List<DslBinding>();

        foreach (var stmt in statements)
        {
            if (stmt is not LocalDeclarationStatementSyntax localDecl) continue;

            var variable = localDecl.Declaration.Variables.FirstOrDefault();
            if (variable?.Initializer?.Value == null) continue;

            var varName = variable.Identifier.Text;
            var expr = variable.Initializer.Value;

            var binding = TryParseProducerBinding(varName, expr);
            if (binding != null)
                bindings.Add(binding);
        }

        return bindings;
    }

    private DslBinding? TryParseProducerBinding(string varName, ExpressionSyntax expr)
    {
        // Unwrap the fluent chain: Producer.Draft*().With(...).With(...).Build()
        var withMutations = new List<DslWithMutation>();
        var hasBuild = false;
        string? producerCall = null;

        var current = expr;

        while (current is InvocationExpressionSyntax invocation)
        {
            if (invocation.Expression is MemberAccessExpressionSyntax memberAccess)
            {
                var methodName = memberAccess.Name.Identifier.Text;

                if (methodName == "Build")
                {
                    hasBuild = true;
                    current = memberAccess.Expression;
                    continue;
                }

                if (methodName == "With" && invocation.ArgumentList.Arguments.Count > 0)
                {
                    var mutation = TryParseWithMutation(invocation.ArgumentList.Arguments[0]);
                    if (mutation != null)
                        withMutations.Insert(0, mutation); // Insert at beginning since we're unwinding from outside-in

                    current = memberAccess.Expression;
                    continue;
                }

                // Check if this is the Producer.DraftXxx() call
                var fullCall = invocation.Expression.ToString();
                if (fullCall.Contains("Producer.") || fullCall.StartsWith("Producer.", StringComparison.Ordinal))
                {
                    producerCall = fullCall;
                    break;
                }

                // Try the inner expression
                current = memberAccess.Expression;
            }
            else
            {
                // Direct call like Producer.DraftValidAccount()
                var callText = invocation.Expression.ToString();
                if (callText.Contains("Producer."))
                {
                    producerCall = callText;
                }
                break;
            }
        }

        if (producerCall == null) return null;

        return new DslBinding
        {
            Id = varName,
            Var = varName,
            Kind = "producerDraft",
            Producer = new DslProducerCall
            {
                Call = producerCall,
                With = withMutations
            },
            Build = hasBuild
        };
    }

    private DslWithMutation? TryParseWithMutation(ArgumentSyntax argument)
    {
        // .With(a => a.Property = value)
        ExpressionSyntax? lambdaBody = null;

        if (argument.Expression is SimpleLambdaExpressionSyntax simpleLambda)
        {
            lambdaBody = simpleLambda.Body as ExpressionSyntax;
            if (lambdaBody == null && simpleLambda.Body is BlockSyntax simpleBlock)
                lambdaBody = simpleBlock.Statements.FirstOrDefault() is ExpressionStatementSyntax es ? es.Expression : null;
        }
        else if (argument.Expression is ParenthesizedLambdaExpressionSyntax parenLambda)
        {
            lambdaBody = parenLambda.Body as ExpressionSyntax;
            if (lambdaBody == null && parenLambda.Body is BlockSyntax parenBlock)
                lambdaBody = parenBlock.Statements.FirstOrDefault() is ExpressionStatementSyntax es2 ? es2.Expression : null;
        }

        if (lambdaBody == null)
            return null;

        if (lambdaBody is not AssignmentExpressionSyntax assignment)
            return null;

        // Extract property path from left side: a.PropertyName
        var path = ExtractPropertyPath(assignment.Left);
        if (path == null) return null;

        // Extract value from right side
        var value = DecompileExpression(assignment.Right);

        return new DslWithMutation { Path = path, Value = value };
    }

    private static string? ExtractPropertyPath(ExpressionSyntax expr)
    {
        if (expr is MemberAccessExpressionSyntax memberAccess)
            return memberAccess.Name.Identifier.Text;
        return null;
    }

    // --- Act Parsing ---

    private DslAct ParseActSection(List<StatementSyntax> statements)
    {
        foreach (var stmt in statements)
        {
            // var result = AdminDao.Create(entity.Entity);
            if (stmt is LocalDeclarationStatementSyntax localDecl)
            {
                var variable = localDecl.Declaration.Variables.FirstOrDefault();
                if (variable?.Initializer?.Value is InvocationExpressionSyntax invocation ||
                    variable?.Initializer?.Value is AwaitExpressionSyntax)
                {
                    var resultVar = variable.Identifier.Text;
                    var invokeExpr = variable.Initializer.Value is AwaitExpressionSyntax awaitExpr
                        ? awaitExpr.Expression as InvocationExpressionSyntax
                        : variable.Initializer.Value as InvocationExpressionSyntax;
                    var awaited = variable.Initializer.Value is AwaitExpressionSyntax;

                    if (invokeExpr != null)
                    {
                        var operation = ParseAdminDaoOperation(invokeExpr, awaited);
                        if (operation != null)
                            return new DslAct { ResultVar = resultVar, Operation = operation };
                    }
                }
            }

            // AdminDao.Update(entity.Entity); (no result variable)
            if (stmt is ExpressionStatementSyntax exprStmt)
            {
                InvocationExpressionSyntax? invokeExpr;
                bool awaited;

                if (exprStmt.Expression is AwaitExpressionSyntax awaitExpr2)
                {
                    invokeExpr = awaitExpr2.Expression as InvocationExpressionSyntax;
                    awaited = true;
                }
                else
                {
                    invokeExpr = exprStmt.Expression as InvocationExpressionSyntax;
                    awaited = false;
                }

                if (invokeExpr != null)
                {
                    var operation = ParseAdminDaoOperation(invokeExpr, awaited);
                    if (operation != null)
                        return new DslAct { ResultVar = null, Operation = operation };
                }
            }
        }

        // Fallback
        return new DslAct
        {
            Operation = new DslOperation { Kind = "create", Awaited = false }
        };
    }

    private DslOperation? ParseAdminDaoOperation(InvocationExpressionSyntax invocation, bool awaited)
    {
        if (invocation.Expression is not MemberAccessExpressionSyntax memberAccess) return null;

        var receiver = memberAccess.Expression.ToString();
        if (!receiver.Contains("AdminDao")) return null;

        var methodName = memberAccess.Name.Identifier.Text;
        var genericType = (memberAccess.Name as GenericNameSyntax)?
            .TypeArgumentList.Arguments.FirstOrDefault()?.ToString();
        var args = invocation.ArgumentList.Arguments;

        // Detect unawaited variant
        var unawaitedVariant = methodName.Contains("Unawaited");

        // Normalize method name
        var normalizedMethod = methodName
            .Replace("UnawaitedAsync", "")
            .Replace("Async", "");

        return normalizedMethod switch
        {
            "Create" => new DslOperation
            {
                Kind = "create",
                GenericType = genericType ?? InferGenericType(args),
                Entity = ParseEntityArg(args),
                Awaited = awaited,
                UnawaitedVariant = unawaitedVariant
            },
            "Update" => new DslOperation
            {
                Kind = "update",
                GenericType = genericType ?? InferGenericType(args),
                Entity = ParseEntityArg(args),
                Awaited = awaited,
                UnawaitedVariant = unawaitedVariant
            },
            "Delete" => new DslOperation
            {
                Kind = "delete",
                GenericType = genericType,
                Id = args.Count > 0 ? DecompileExpression(args[0].Expression) : null,
                Awaited = awaited,
                UnawaitedVariant = unawaitedVariant
            },
            "AssociateEntities" => ParseRelationshipOperation("associate", args, awaited, unawaitedVariant),
            "DisassociateEntities" => ParseRelationshipOperation("disassociate", args, awaited, unawaitedVariant),
            _ => null
        };
    }

    private DslOperation ParseRelationshipOperation(string kind, SeparatedSyntaxList<ArgumentSyntax> args, bool awaited, bool unawaitedVariant)
    {
        string? relationshipName = null;
        DslValueExpression? target = null;
        DslValueExpression? related = null;

        if (args.Count >= 1 && args[0].Expression is LiteralExpressionSyntax relLit)
            relationshipName = relLit.Token.ValueText;
        if (args.Count >= 2) target = DecompileExpression(args[1].Expression);
        if (args.Count >= 3) related = DecompileExpression(args[2].Expression);

        return new DslOperation
        {
            Kind = kind,
            RelationshipName = relationshipName,
            Target = target,
            Related = related != null ? new DslRelated { Kind = "single", Value = related } : null,
            Awaited = awaited,
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
                Member = memberAccess.Name.Identifier.Text
            };
        }

        return new DslEntityRef { FromBinding = expr.ToString(), Member = "Entity" };
    }

    private static string? InferGenericType(SeparatedSyntaxList<ArgumentSyntax> args)
    {
        // Try to infer generic type from entity argument like account.Entity
        if (args.Count > 0 && args[0].Expression is MemberAccessExpressionSyntax ma)
        {
            var bindingName = ma.Expression.ToString();
            // Capitalize first letter as a convention guess
            if (bindingName.Length > 0)
                return char.ToUpper(bindingName[0]) + bindingName[1..];
        }
        return null;
    }

    // --- Assert Parsing ---

    private (List<DslRetrieval>, List<DslAssertion>) ParseAssertSection(List<StatementSyntax> statements)
    {
        var retrievals = new List<DslRetrieval>();
        var assertions = new List<DslAssertion>();

        foreach (var stmt in statements)
        {
            // var x = AdminDao.RetrieveFirstOrDefault(...)
            if (stmt is LocalDeclarationStatementSyntax localDecl)
            {
                var variable = localDecl.Declaration.Variables.FirstOrDefault();
                if (variable?.Initializer?.Value != null)
                {
                    var retrieval = TryParseRetrieval(variable.Identifier.Text, variable.Initializer.Value);
                    if (retrieval != null)
                    {
                        retrievals.Add(retrieval);
                        continue;
                    }
                }
            }

            // x.Should().NotBeNull()  or  x?.Name.Should().Be(...)
            if (stmt is ExpressionStatementSyntax exprStmt)
            {
                var assertion = TryParseAssertion(exprStmt.Expression);
                if (assertion != null)
                {
                    assertions.Add(assertion);
                    continue;
                }
            }
        }

        return (retrievals, assertions);
    }

    private DslRetrieval? TryParseRetrieval(string varName, ExpressionSyntax expr)
    {
        // Handle await: await AdminDao.RetrieveFirstOrDefaultAsync(...)
        if (expr is AwaitExpressionSyntax awaitExpr)
            expr = awaitExpr.Expression;

        if (expr is not InvocationExpressionSyntax invocation) return null;
        if (invocation.Expression is not MemberAccessExpressionSyntax memberAccess) return null;

        var receiver = memberAccess.Expression.ToString();
        if (!receiver.Contains("AdminDao")) return null;

        var methodName = memberAccess.Name.Identifier.Text
            .Replace("UnawaitedAsync", "")
            .Replace("Async", "");

        var kind = methodName switch
        {
            "RetrieveFirstOrDefault" => "retrieveFirstOrDefault",
            "RetrieveFirst" => "retrieveFirst",
            "RetrieveSingle" => "retrieveSingle",
            "RetrieveList" => "retrieveList",
            _ => null
        };

        if (kind == null) return null;

        // Parse the lambda argument: xrm => xrm.AccountSet.Where(a => a.Id == value)
        if (invocation.ArgumentList.Arguments.Count == 0) return null;

        var lambdaArg = invocation.ArgumentList.Arguments[0].Expression;
        return ParseRetrievalLambda(varName, kind, lambdaArg);
    }

    private DslRetrieval? ParseRetrievalLambda(string varName, string kind, ExpressionSyntax lambdaExpr)
    {
        ExpressionSyntax? body = null;

        if (lambdaExpr is SimpleLambdaExpressionSyntax simpleLambda)
            body = simpleLambda.Body as ExpressionSyntax;
        else if (lambdaExpr is ParenthesizedLambdaExpressionSyntax parenLambda)
            body = parenLambda.Body as ExpressionSyntax;

        if (body == null) return null;

        // Expect: xrm.AccountSet.Where(a => a.Id == createdAccountId)
        if (body is not InvocationExpressionSyntax whereInvocation) return null;
        if (whereInvocation.Expression is not MemberAccessExpressionSyntax whereAccess) return null;
        if (whereAccess.Name.Identifier.Text != "Where") return null;

        // Extract entity set: xrm.AccountSet
        var entitySetExpr = whereAccess.Expression;
        string? entitySet = null;

        if (entitySetExpr is MemberAccessExpressionSyntax entitySetAccess)
            entitySet = entitySetAccess.Name.Identifier.Text;

        if (entitySet == null) return null;

        // Extract Where predicate
        if (whereInvocation.ArgumentList.Arguments.Count == 0) return null;

        var whereArg = whereInvocation.ArgumentList.Arguments[0].Expression;
        var (alias, whereExpr) = ParseWhereLambda(whereArg);

        if (whereExpr == null)
        {
            _diagnostics.Add(new DslDiagnostic
            {
                Code = DslDiagnosticCodes.UnsupportedLinqShape,
                Message = $"Could not parse Where predicate in retrieval for '{varName}'.",
                Location = new DslDiagnosticLocation { Section = "assert", Hint = whereArg.ToString() }
            });
            return null;
        }

        return new DslRetrieval
        {
            Var = varName,
            Kind = kind,
            EntitySet = entitySet,
            Alias = alias ?? "x",
            Where = whereExpr
        };
    }

    private (string? alias, DslWhereExpression? expr) ParseWhereLambda(ExpressionSyntax lambdaExpr)
    {
        string? alias = null;
        ExpressionSyntax? body = null;

        if (lambdaExpr is SimpleLambdaExpressionSyntax simpleLambda)
        {
            alias = simpleLambda.Parameter.Identifier.Text;
            body = simpleLambda.Body as ExpressionSyntax;
        }
        else if (lambdaExpr is ParenthesizedLambdaExpressionSyntax parenLambda)
        {
            alias = parenLambda.ParameterList.Parameters.FirstOrDefault()?.Identifier.Text;
            body = parenLambda.Body as ExpressionSyntax;
        }

        if (body == null) return (alias, null);

        var whereExpr = ParseWhereExpression(body, alias);
        return (alias, whereExpr);
    }

    private DslWhereExpression? ParseWhereExpression(ExpressionSyntax expr, string? alias)
    {
        if (expr is BinaryExpressionSyntax binary)
        {
            if (binary.IsKind(SyntaxKind.EqualsExpression))
            {
                return new DslWhereExpression
                {
                    Op = "eq",
                    Left = ParseMemberExpression(binary.Left, alias),
                    Right = DecompileExpression(binary.Right)
                };
            }

            if (binary.IsKind(SyntaxKind.LogicalAndExpression))
            {
                var left = ParseWhereExpression(binary.Left, alias);
                var right = ParseWhereExpression(binary.Right, alias);
                var items = new List<DslWhereExpression>();
                if (left != null) items.Add(left);
                if (right != null) items.Add(right);
                return new DslWhereExpression { Op = "and", Items = items };
            }
        }

        return null;
    }

    private DslMemberExpr? ParseMemberExpression(ExpressionSyntax expr, string? alias)
    {
        var parts = new List<string>();
        var current = expr;

        while (current is MemberAccessExpressionSyntax memberAccess)
        {
            parts.Insert(0, memberAccess.Name.Identifier.Text);
            current = memberAccess.Expression;
        }

        if (current is IdentifierNameSyntax identifier)
        {
            var root = identifier.Identifier.Text;
            if (root == alias)
                return new DslMemberExpr { Kind = "member", Root = "alias", Path = parts };
            return new DslMemberExpr { Kind = "member", Root = root, Path = parts };
        }

        return null;
    }

    // --- Assertion Parsing ---

    private DslAssertion? TryParseAssertion(ExpressionSyntax expr)
    {
        // Walk the invocation chain to find .Should().XXX()
        // Pattern: target.Should().NotBeNull()
        // Pattern: target?.Name.Should().Be(expected)
        // Pattern: target.Should().ContainSingle(predicate)

        if (expr is not InvocationExpressionSyntax outerInvocation) return null;
        if (outerInvocation.Expression is not MemberAccessExpressionSyntax outerAccess) return null;

        var assertionMethod = outerAccess.Name.Identifier.Text;

        // The receiver should be .Should()
        if (outerAccess.Expression is not InvocationExpressionSyntax shouldInvocation) return null;
        if (shouldInvocation.Expression is not MemberAccessExpressionSyntax shouldAccess) return null;
        if (shouldAccess.Name.Identifier.Text != "Should") return null;

        // Extract the target (what .Should() is called on)
        var targetExpr = shouldAccess.Expression;
        var target = ExtractAssertionTarget(targetExpr);

        return assertionMethod switch
        {
            "NotBeNull" => new DslAssertion
            {
                Kind = "notNull",
                Target = target
            },
            "Be" when outerInvocation.ArgumentList.Arguments.Count > 0 => new DslAssertion
            {
                Kind = "be",
                Target = target,
                Expected = DecompileExpression(outerInvocation.ArgumentList.Arguments[0].Expression)
            },
            "ContainSingle" when outerInvocation.ArgumentList.Arguments.Count > 0 => new DslAssertion
            {
                Kind = "containSingle",
                Target = target,
                Predicate = ParseContainSinglePredicate(outerInvocation.ArgumentList.Arguments[0])
            },
            "ContainSingle" => new DslAssertion
            {
                Kind = "containSingle",
                Target = target
            },
            _ => HandleUnsupportedAssertion(assertionMethod, expr)
        };
    }

    private DslAssertion? HandleUnsupportedAssertion(string methodName, ExpressionSyntax expr)
    {
        _diagnostics.Add(new DslDiagnostic
        {
            Code = DslDiagnosticCodes.UnsupportedAssertion,
            Message = $"Unsupported assertion: '.Should().{methodName}(...)'. Only Be, NotBeNull, and ContainSingle are supported.",
            Location = new DslDiagnosticLocation { Section = "assert", Hint = expr.ToString() }
        });
        return null;
    }

    private DslAssertionTarget ExtractAssertionTarget(ExpressionSyntax expr)
    {
        // Handle null-conditional: retrievedAccount?.Name
        if (expr is ConditionalAccessExpressionSyntax conditionalAccess)
        {
            var rootVar = conditionalAccess.Expression.ToString();
            if (conditionalAccess.WhenNotNull is MemberBindingExpressionSyntax memberBinding)
            {
                return new DslAssertionTarget
                {
                    Kind = "member",
                    RootVar = rootVar,
                    Path = [memberBinding.Name.Identifier.Text]
                };
            }

            return new DslAssertionTarget { Kind = "var", Name = rootVar };
        }

        // Handle member access: retrievedAccount.Name
        if (expr is MemberAccessExpressionSyntax memberAccess)
        {
            var parts = new List<string>();
            var current = (ExpressionSyntax)memberAccess;

            while (current is MemberAccessExpressionSyntax ma)
            {
                parts.Insert(0, ma.Name.Identifier.Text);
                current = ma.Expression;
            }

            if (current is IdentifierNameSyntax id)
            {
                if (parts.Count > 0)
                {
                    return new DslAssertionTarget
                    {
                        Kind = "member",
                        RootVar = id.Identifier.Text,
                        Path = parts
                    };
                }
                return new DslAssertionTarget { Kind = "var", Name = id.Identifier.Text };
            }
        }

        // Simple identifier
        if (expr is IdentifierNameSyntax identifier)
            return new DslAssertionTarget { Kind = "var", Name = identifier.Identifier.Text };

        return new DslAssertionTarget { Kind = "var", Name = expr.ToString() };
    }

    private DslPredicate? ParseContainSinglePredicate(ArgumentSyntax argument)
    {
        ExpressionSyntax? body = null;
        string? alias = null;

        if (argument.Expression is SimpleLambdaExpressionSyntax simpleLambda)
        {
            alias = simpleLambda.Parameter.Identifier.Text;
            body = simpleLambda.Body as ExpressionSyntax;
        }
        else if (argument.Expression is ParenthesizedLambdaExpressionSyntax parenLambda)
        {
            alias = parenLambda.ParameterList.Parameters.FirstOrDefault()?.Identifier.Text;
            body = parenLambda.Body as ExpressionSyntax;
        }

        if (body is not BinaryExpressionSyntax binary || !binary.IsKind(SyntaxKind.EqualsExpression))
            return null;

        // Extract: c.FullName == "John Doe"
        var path = new List<string>();
        var leftExpr = binary.Left;
        while (leftExpr is MemberAccessExpressionSyntax ma)
        {
            path.Insert(0, ma.Name.Identifier.Text);
            leftExpr = ma.Expression;
        }

        var right = DecompileExpression(binary.Right);

        return new DslPredicate
        {
            Alias = alias ?? "x",
            Op = "eq",
            Left = new DslPredicateLeft { Path = path },
            Right = right
        };
    }

    // --- Expression Decompilation ---

    private DslValueExpression DecompileExpression(ExpressionSyntax expr)
    {
        // String literal: "text"
        if (expr is LiteralExpressionSyntax literal)
        {
            return literal.Kind() switch
            {
                SyntaxKind.StringLiteralExpression => new DslStringValue { Value = literal.Token.ValueText },
                SyntaxKind.NumericLiteralExpression => new DslNumberValue { Value = Convert.ToDouble(literal.Token.Value) },
                SyntaxKind.TrueLiteralExpression => new DslBooleanValue { Value = true },
                SyntaxKind.FalseLiteralExpression => new DslBooleanValue { Value = false },
                SyntaxKind.NullLiteralExpression => new DslNullValue(),
                _ => new DslStringValue { Value = literal.Token.ValueText }
            };
        }

        // Interpolated string: $"..."
        if (expr is InterpolatedStringExpressionSyntax interpolated)
        {
            return DecompileInterpolatedString(interpolated);
        }

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

        // Member access: EnumType.Member or binding.Entity or binding.ToEntityReference()
        if (expr is MemberAccessExpressionSyntax memberAccess)
        {
            return DecompileMemberAccess(memberAccess);
        }

        // Invocation: binding.ToEntityReference()
        if (expr is InvocationExpressionSyntax invocation &&
            invocation.Expression is MemberAccessExpressionSyntax invokeAccess)
        {
            var id = invokeAccess.Expression.ToString();
            var call = invokeAccess.Name.Identifier.Text;
            return new DslRefValue
            {
                Ref = new DslRefExpr { Kind = "bindingVar", Id = id, Call = call }
            };
        }

        // Simple identifier: could be a variable reference
        if (expr is IdentifierNameSyntax identifier)
        {
            return new DslRefValue
            {
                Ref = new DslRefExpr { Kind = "bindingVar", Id = identifier.Identifier.Text }
            };
        }

        // Fallback: treat as string
        return new DslStringValue { Value = expr.ToString() };
    }

    private DslValueExpression DecompileMemberAccess(MemberAccessExpressionSyntax memberAccess)
    {
        var left = memberAccess.Expression.ToString();
        var right = memberAccess.Name.Identifier.Text;

        // Check if this looks like an enum: TypeName.MemberName (both PascalCase, no dots in left)
        if (!left.Contains('.') && char.IsUpper(left[0]) && char.IsUpper(right[0]) &&
            left.Contains('_'))
        {
            // Strong enum signal: contains underscore like Account_CustomerTypeCode.Customer
            return new DslEnumValue { EnumType = left, Member = right };
        }

        // Heuristic: if left is a simple PascalCase identifier without dots and right is PascalCase,
        // it could be an enum. But it could also be a static class member.
        // Without semantic analysis, we use a best-effort approach:
        // If it's not a known binding/variable pattern, treat as enum
        if (!left.Contains('.') && char.IsUpper(left[0]) && char.IsUpper(right[0]))
        {
            return new DslEnumValue { EnumType = left, Member = right };
        }

        // Otherwise it's a reference to a binding member
        return new DslRefValue
        {
            Ref = new DslRefExpr { Kind = "bindingVar", Id = left, Member = right }
        };
    }

    private DslInterpolationValue DecompileInterpolatedString(InterpolatedStringExpressionSyntax interpolated)
    {
        var template = new System.Text.StringBuilder();

        foreach (var content in interpolated.Contents)
        {
            if (content is InterpolatedStringTextSyntax text)
            {
                template.Append(text.TextToken.ValueText);
            }
            else if (content is InterpolationSyntax interpolation)
            {
                template.Append("${");
                template.Append(interpolation.Expression.ToString());
                template.Append('}');
            }
        }

        return new DslInterpolationValue { Template = template.ToString() };
    }

    // --- Helpers ---

    private static DslTestDefinition CreateEmptyDefinition()
    {
        return new DslTestDefinition
        {
            Test = new DslTest
            {
                Framework = "xunit",
                Name = "Unknown",
                Arrange = new DslArrange(),
                Act = new DslAct { Operation = new DslOperation { Kind = "create" } },
                Assert = new DslAssert()
            }
        };
    }
}
