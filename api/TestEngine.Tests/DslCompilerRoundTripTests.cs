using TestEngine.Models.Dsl;
using TestEngine.Services;

namespace TestEngine.Tests;

public class DslCompilerRoundTripTests
{
    private readonly DslCompilerService _service = new();
    private readonly DslCompileOptions _methodOnly = new() { EmitClassShell = false };
    private readonly DslCompileOptions _withClassShell = new() { EmitClassShell = true };

    private readonly Dictionary<string, string> _producerEntityMap = new()
    {
        ["DraftValidDeveloper"] = "ape_developer",
        ["DraftValidSkill"] = "ape_skill",
        ["DraftValidAccount"] = "Account",
        ["DraftInvalidAccount"] = "Account",
    };

    /// <summary>
    /// Helper: decompile C# -> DSL -> compile back to C#, return both the DSL and recompiled code.
    /// </summary>
    private async Task<(DslTestDefinition dsl, string recompiledCode, List<DslDiagnostic> allDiagnostics)>
        RoundTrip(string csharpCode, DslCompileOptions? compileOptions = null)
    {
        var decompileResult = await _service.DecompileFromCSharpAsync(csharpCode, _producerEntityMap);
        var options = compileOptions ?? _methodOnly;
        var compileResult = await _service.CompileToCSharpAsync(decompileResult.Dsl, options);

        var allDiags = decompileResult.Diagnostics.Concat(compileResult.Diagnostics).ToList();
        return (decompileResult.Dsl, compileResult.CSharpCode, allDiags);
    }

    /// <summary>
    /// Wraps a method-only snippet in a minimal class shell so Roslyn can parse it correctly.
    /// </summary>
    private static string WrapInClass(string methodSnippet)
    {
        return $$"""
            public class TestClass : TestBase
            {
                public TestClass(XrmMockupFixture fixture) : base(fixture) { }

                {{methodSnippet}}
            }
            """;
    }

    /// <summary>
    /// Normalizes whitespace for comparison: trims lines, removes blank lines, trims overall.
    /// </summary>
    private static string Normalize(string code)
    {
        var lines = code.Split('\n')
            .Select(l => l.TrimEnd())
            .Where(l => l.Length > 0);
        return string.Join("\n", lines).Trim();
    }

    // ─── Test: fire-and-forget producers + RetrieveList without Where ─────────

    [Fact]
    public async Task FireAndForgetProducers_And_RetrieveListWithoutWhere_RoundTrip()
    {
        const string input = """
            using SharedTest;
            namespace IntegrationTests.Developer;
            public class CreateDeveloperSkillsForNewDeveloperTests : TestBase
            {
                public CreateDeveloperSkillsForNewDeveloperTests(XrmMockupFixture fixture)
                    : base(fixture) { }

                [Fact]
                public void EnsureDeveloperSkillsCreated()
                {
                    // Arrange
                    Producer.DraftValidSkill().Build();
                    Producer.DraftValidSkill().Build();
                    var developer = Producer.DraftValidDeveloper();

                    // Act
                    AdminDao.Create(developer.Entity);

                    // Assert
                    var developerSkills = AdminDao.RetrieveList(xrm => xrm.ape_developerskillSet);
                    developerSkills.Count.Should().Be(2);
                }
            }
            """;

        var (dsl, recompiled, diagnostics) = await RoundTrip(input);

        // Verify no diagnostics
        Assert.Empty(diagnostics);

        // Verify DSL captured all 3 arrange bindings
        Assert.Equal(3, dsl.Test.Arrange.Bindings.Count);

        // First two are fire-and-forget builds
        Assert.True(dsl.Test.Arrange.Bindings[0].Build);
        Assert.True(dsl.Test.Arrange.Bindings[1].Build);
        Assert.StartsWith("_anon", dsl.Test.Arrange.Bindings[0].Id);
        Assert.StartsWith("_anon", dsl.Test.Arrange.Bindings[1].Id);

        // Third is the named developer binding
        Assert.Equal("developer", dsl.Test.Arrange.Bindings[2].Var);
        Assert.False(dsl.Test.Arrange.Bindings[2].Build);

        // Verify DSL captured the retrieval without a Where clause
        Assert.Single(dsl.Test.Assert.Retrievals);
        Assert.Equal("retrieveList", dsl.Test.Assert.Retrievals[0].Kind);
        Assert.Equal("ape_developerskillSet", dsl.Test.Assert.Retrievals[0].EntitySet);
        Assert.Null(dsl.Test.Assert.Retrievals[0].Where);

        // Verify assertion was captured
        Assert.Single(dsl.Test.Assert.Assertions);
        Assert.Equal("be", dsl.Test.Assert.Assertions[0].Kind);

        // Verify recompiled code contains the key elements
        Assert.Contains("Producer.DraftValidSkill()", recompiled);
        Assert.Contains(".Build();", recompiled);
        Assert.Contains("var developer = Producer.DraftValidDeveloper();", recompiled);
        Assert.Contains("AdminDao.Create", recompiled);
        Assert.Contains("developer.Entity", recompiled);
        Assert.Contains("AdminDao.RetrieveList(xrm => xrm.ape_developerskillSet);", recompiled);
        Assert.Contains(".Should().Be(2);", recompiled);
    }

    // ─── Test: simple create with retrieval + Where ──────────────────────────

    [Fact]
    public async Task SimpleCreateWithWhereRetrieval_RoundTrip()
    {
        var input = WrapInClass("""
            [Fact]
            public void EnsureAccountCreated()
            {
                // Arrange
                var account = Producer.DraftValidAccount()
                    .With(a => a.Name = "Test Account")
                    .Build();

                // Act
                AdminDao.Create(account.Entity);

                // Assert
                var retrieved = AdminDao.RetrieveFirstOrDefault(
                    xrm => xrm.AccountSet.Where(a => a.Id == account.Entity.Id));
                retrieved.Should().NotBeNull();
            }
            """);

        var (dsl, recompiled, diagnostics) = await RoundTrip(input);

        Assert.Empty(diagnostics);

        // Arrange: one binding with With + Build
        Assert.Single(dsl.Test.Arrange.Bindings);
        var binding = dsl.Test.Arrange.Bindings[0];
        Assert.Equal("account", binding.Var);
        Assert.True(binding.Build);
        Assert.Single(binding.Producer.With);
        Assert.Equal("Name", binding.Producer.With[0].Path);

        // Act
        Assert.Equal("create", dsl.Test.Act.Operation.Kind);
        Assert.Equal("account", dsl.Test.Act.Operation.Entity?.FromBinding);

        // Assert: retrieval with Where
        Assert.Single(dsl.Test.Assert.Retrievals);
        Assert.Equal("retrieveFirstOrDefault", dsl.Test.Assert.Retrievals[0].Kind);
        Assert.NotNull(dsl.Test.Assert.Retrievals[0].Where);
        Assert.Equal("eq", dsl.Test.Assert.Retrievals[0].Where!.Op);

        // Assert: notNull assertion (?.Name.Should().Be() is a conditional access not yet supported)
        Assert.Single(dsl.Test.Assert.Assertions);
        Assert.Equal("notNull", dsl.Test.Assert.Assertions[0].Kind);

        // Recompiled code fidelity
        Assert.Contains(".With(a => a.Name = \"Test Account\")", recompiled);
        Assert.Contains(".Build();", recompiled);
        Assert.Contains("AdminDao.RetrieveFirstOrDefault(", recompiled);
        Assert.Contains(".Where(a =>", recompiled);
    }

    // ─── Test: async test with update and multiple With mutations ─────────────

    [Fact]
    public async Task AsyncTestWithUpdate_RoundTrip()
    {
        var input = WrapInClass("""
            [Fact]
            public async Task EnsureAccountUpdated()
            {
                // Arrange
                var account = Producer.DraftValidAccount()
                    .With(a => a.Name = "Original")
                    .With(a => a.EMailAddress1 = "test@test.com")
                    .Build();

                // Act
                await AdminDao.UpdateAsync(account.Entity);

                // Assert
                var retrieved = await AdminDao.RetrieveFirstOrDefaultAsync(
                    xrm => xrm.AccountSet.Where(a => a.Id == account.Entity.Id));
                retrieved.Should().NotBeNull();
            }
            """);

        var (dsl, recompiled, diagnostics) = await RoundTrip(input);

        Assert.Empty(diagnostics);

        // Async flag
        Assert.True(dsl.Test.Async);

        // Multiple With mutations preserved in order
        Assert.Equal(2, dsl.Test.Arrange.Bindings[0].Producer.With.Count);
        Assert.Equal("Name", dsl.Test.Arrange.Bindings[0].Producer.With[0].Path);
        Assert.Equal("EMailAddress1", dsl.Test.Arrange.Bindings[0].Producer.With[1].Path);

        // Act: update + awaited
        Assert.Equal("update", dsl.Test.Act.Operation.Kind);
        Assert.True(dsl.Test.Act.Operation.Awaited);

        // Recompiled code
        Assert.Contains("async Task", recompiled);
        Assert.Contains("await AdminDao.UpdateAsync", recompiled);
        Assert.Contains("await AdminDao.RetrieveFirstOrDefaultAsync(", recompiled);
    }

    // ─── Test: delete operation ──────────────────────────────────────────────

    [Fact]
    public async Task DeleteOperation_RoundTrip()
    {
        var input = WrapInClass("""
            [Fact]
            public void EnsureAccountDeleted()
            {
                // Arrange
                var account = Producer.DraftValidAccount()
                    .Build();

                // Act
                AdminDao.Delete<Account>(account.Entity.Id);

                // Assert
                var retrieved = AdminDao.RetrieveFirstOrDefault(
                    xrm => xrm.AccountSet.Where(a => a.Id == account.Entity.Id));
                retrieved.Should().Be(null);
            }
            """);

        var (dsl, recompiled, diagnostics) = await RoundTrip(input);

        Assert.Empty(diagnostics);

        // Act: delete with generic type
        Assert.Equal("delete", dsl.Test.Act.Operation.Kind);
        Assert.Equal("Account", dsl.Test.Act.Operation.GenericType);

        // Recompiled code
        Assert.Contains("AdminDao.Delete<Account>(", recompiled);
    }

    // ─── Test: ContainSingle assertion with predicate ────────────────────────

    [Fact]
    public async Task ContainSingleWithPredicate_RoundTrip()
    {
        var input = WrapInClass("""
            [Fact]
            public void EnsureSkillExists()
            {
                // Arrange
                var skill = Producer.DraftValidSkill()
                    .With(s => s.ape_name = "C#")
                    .Build();

                // Act
                AdminDao.Create(skill.Entity);

                // Assert
                var skills = AdminDao.RetrieveList(
                    xrm => xrm.ape_skillSet.Where(s => s.ape_name == "C#"));
                skills.Should().ContainSingle(s => s.ape_name == "C#");
            }
            """);

        var (dsl, recompiled, diagnostics) = await RoundTrip(input);

        Assert.Empty(diagnostics);

        // ContainSingle with predicate
        Assert.Single(dsl.Test.Assert.Assertions);
        Assert.Equal("containSingle", dsl.Test.Assert.Assertions[0].Kind);
        Assert.NotNull(dsl.Test.Assert.Assertions[0].Predicate);
        Assert.Equal("eq", dsl.Test.Assert.Assertions[0].Predicate!.Op);

        Assert.Contains(".Should().ContainSingle(", recompiled);
    }

    // ─── Test: Ignored/Skipped test ──────────────────────────────────────────

    [Fact]
    public async Task SkippedFactTest_RoundTrip()
    {
        var input = WrapInClass("""
            [Fact(Skip = "Not implemented yet")]
            public void PlaceholderTest()
            {
                // Arrange
                var account = Producer.DraftValidAccount();

                // Act
                AdminDao.Create(account.Entity);

                // Assert
                account.Should().NotBeNull();
            }
            """);

        var (dsl, recompiled, diagnostics) = await RoundTrip(input);

        Assert.Empty(diagnostics);

        Assert.NotNull(dsl.Test.Ignore);
        Assert.Equal("Not implemented yet", dsl.Test.Ignore!.Reason);
        Assert.Contains("[Fact(Skip = \"Not implemented yet\")]", recompiled);
    }

    // ─── Test: multiple bindings with associate ──────────────────────────────

    [Fact]
    public async Task MultipleNamedBindings_RoundTrip()
    {
        var input = WrapInClass("""
            [Fact]
            public void EnsureAssociation()
            {
                // Arrange
                var account = Producer.DraftValidAccount()
                    .Build();
                var developer = Producer.DraftValidDeveloper()
                    .Build();

                // Act
                AdminDao.AssociateEntities("ape_account_developer", account.ToEntityReference(), developer.ToEntityReference());

                // Assert
                account.Should().NotBeNull();
            }
            """);

        var (dsl, recompiled, diagnostics) = await RoundTrip(input);

        Assert.Empty(diagnostics);

        // Two named bindings, both built
        Assert.Equal(2, dsl.Test.Arrange.Bindings.Count);
        Assert.Equal("account", dsl.Test.Arrange.Bindings[0].Var);
        Assert.Equal("developer", dsl.Test.Arrange.Bindings[1].Var);

        // Act: associate
        Assert.Equal("associate", dsl.Test.Act.Operation.Kind);
        Assert.Equal("ape_account_developer", dsl.Test.Act.Operation.RelationshipName);

        Assert.Contains("AdminDao.AssociateEntities(", recompiled);
    }

    // ─── Test: heuristic-based AAA splitting (no comments) ───────────────────

    [Fact]
    public async Task HeuristicBasedSplitting_WhenNoComments_RoundTrip()
    {
        var input = WrapInClass("""
            [Fact]
            public void NoCommentTest()
            {
                var account = Producer.DraftValidAccount().Build();
                AdminDao.Create(account.Entity);
                account.Should().NotBeNull();
            }
            """);

        var (dsl, recompiled, diagnostics) = await RoundTrip(input);

        Assert.Empty(diagnostics);

        // Should still correctly identify the sections
        Assert.Single(dsl.Test.Arrange.Bindings);
        Assert.Equal("create", dsl.Test.Act.Operation.Kind);
        Assert.Single(dsl.Test.Assert.Assertions);
        Assert.Equal("notNull", dsl.Test.Assert.Assertions[0].Kind);
    }

    // ─── Test: DSL -> C# -> DSL stability (double round-trip) ────────────────

    [Fact]
    public async Task DoubleRoundTrip_IsStable()
    {
        var input = WrapInClass("""
            [Fact]
            public void StabilityTest()
            {
                // Arrange
                Producer.DraftValidSkill().Build();
                var developer = Producer.DraftValidDeveloper()
                    .With(d => d.ape_name = "John")
                    .Build();

                // Act
                AdminDao.Create(developer.Entity);

                // Assert
                developer.Should().NotBeNull();
            }
            """);

        // First round-trip: compile with class shell so second decompile can find [Fact]
        var (_, firstRecompiled, _) = await RoundTrip(input, _withClassShell);

        // Second round-trip from the first recompiled output
        var decompile2 = await _service.DecompileFromCSharpAsync(firstRecompiled, _producerEntityMap);
        var compile2 = await _service.CompileToCSharpAsync(decompile2.Dsl, _withClassShell);

        // The two recompiled outputs should be identical
        Assert.Equal(Normalize(firstRecompiled), Normalize(compile2.CSharpCode));
    }
}
