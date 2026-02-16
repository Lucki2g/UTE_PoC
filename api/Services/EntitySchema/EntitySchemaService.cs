using System.Collections.Concurrent;
using Microsoft.CodeAnalysis.CSharp;
using Microsoft.CodeAnalysis.CSharp.Syntax;

namespace TestEngine.Services;

public class EntitySchemaService : IEntitySchemaService
{
    private readonly TestProjectPaths _paths;
    private readonly ConcurrentDictionary<string, List<EntityColumnInfo>> _cache = new(StringComparer.OrdinalIgnoreCase);
    private Dictionary<string, List<string>> _enumCache = new(StringComparer.OrdinalIgnoreCase);
    private bool _parsed;
    private readonly object _parseLock = new();

    public EntitySchemaService(TestProjectPaths paths)
    {
        _paths = paths;
    }

    public Task<List<EntityColumnInfo>> GetColumnsAsync(string entityLogicalName)
    {
        EnsureParsed();

        if (_cache.TryGetValue(entityLogicalName, out var columns))
            return Task.FromResult(columns);

        return Task.FromResult<List<EntityColumnInfo>>([]);
    }

    private void EnsureParsed()
    {
        if (_parsed) return;
        lock (_parseLock)
        {
            if (_parsed) return;
            ParseXrmContext();
            _parsed = true;
        }
    }

    private void ParseXrmContext()
    {
        var filePath = Path.Combine(_paths.RepositoryPath, "src", "Shared", "SharedContext", "XrmContext.cs");
        if (!File.Exists(filePath)) return;

        var code = File.ReadAllText(filePath);
        var tree = CSharpSyntaxTree.ParseText(code);
        var root = tree.GetCompilationUnitRoot();

        // Parse all enum declarations first so we can attach members to columns
        foreach (var enumDecl in root.DescendantNodes().OfType<EnumDeclarationSyntax>())
        {
            var members = enumDecl.Members.Select(m => m.Identifier.Text).ToList();
            _enumCache[enumDecl.Identifier.Text] = members;
        }

        foreach (var classDecl in root.DescendantNodes().OfType<ClassDeclarationSyntax>())
        {
            var entityAttr = classDecl.AttributeLists
                .SelectMany(al => al.Attributes)
                .FirstOrDefault(a => a.Name.ToString() == "EntityLogicalName");

            if (entityAttr is null) continue;

            var entityName = GetAttributeStringArg(entityAttr);
            if (entityName is null) continue;

            var columns = new List<EntityColumnInfo>();
            var seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

            foreach (var prop in classDecl.Members.OfType<PropertyDeclarationSyntax>())
            {
                var logicalNameAttr = prop.AttributeLists
                    .SelectMany(al => al.Attributes)
                    .FirstOrDefault(a => a.Name.ToString() == "AttributeLogicalName");

                if (logicalNameAttr is null) continue;

                var logicalName = GetAttributeStringArg(logicalNameAttr);
                if (logicalName is null || !seen.Add(logicalName)) continue;

                var displayNameAttr = prop.AttributeLists
                    .SelectMany(al => al.Attributes)
                    .FirstOrDefault(a => a.Name.ToString() == "DisplayName");

                var dataType = prop.Type.ToString();
                var enumTypeName = dataType.TrimEnd('?');

                columns.Add(new EntityColumnInfo
                {
                    LogicalName = logicalName,
                    DisplayName = displayNameAttr is not null ? GetAttributeStringArg(displayNameAttr) : null,
                    DataType = dataType,
                    EnumMembers = _enumCache.TryGetValue(enumTypeName, out var members) ? members : null,
                });
            }

            _cache[entityName] = columns;
        }
    }

    private static string? GetAttributeStringArg(AttributeSyntax attr)
    {
        if (attr.ArgumentList?.Arguments.FirstOrDefault()?.Expression
            is LiteralExpressionSyntax { RawKind: (int)SyntaxKind.StringLiteralExpression } literal)
        {
            return literal.Token.ValueText;
        }
        return null;
    }
}
