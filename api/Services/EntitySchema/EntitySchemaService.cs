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

    public Task<List<string>> GetEntityNamesAsync()
    {
        EnsureParsed();
        return Task.FromResult(_cache.Keys.OrderBy(k => k).ToList());
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

        // First pass: build map of C# class name → entity logical name
        var classNameToEntityLogicalName = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        foreach (var classDecl in root.DescendantNodes().OfType<ClassDeclarationSyntax>())
        {
            var entityAttr = classDecl.AttributeLists
                .SelectMany(al => al.Attributes)
                .FirstOrDefault(a => a.Name.ToString() == "EntityLogicalName");
            if (entityAttr is null) continue;
            var entityName = GetAttributeStringArg(entityAttr);
            if (entityName is not null)
                classNameToEntityLogicalName[classDecl.Identifier.Text] = entityName;
        }

        // Second pass: process each entity class
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

            // Build a map from attribute logical name → target entity logical name
            // by finding navigation properties that have both [AttributeLogicalName] and
            // [RelationshipSchemaName], whose return type is a known entity class.
            var logicalNameToTargetEntity = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
            foreach (var prop in classDecl.Members.OfType<PropertyDeclarationSyntax>())
            {
                var attrs = prop.AttributeLists.SelectMany(al => al.Attributes).ToList();

                if (!attrs.Any(a => a.Name.ToString() == "RelationshipSchemaName")) continue;

                var logNameAttr = attrs.FirstOrDefault(a => a.Name.ToString() == "AttributeLogicalName");
                if (logNameAttr is null) continue;

                var logName = GetAttributeStringArg(logNameAttr);
                if (logName is null) continue;

                // Return type is the target entity class (e.g. ape_developer, ape_skill)
                var returnTypeName = GetSimpleTypeName(prop.Type);
                if (returnTypeName is not null && classNameToEntityLogicalName.TryGetValue(returnTypeName, out var targetEntityLogicalName))
                    logicalNameToTargetEntity[logName] = targetEntityLogicalName;
            }

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

                logicalNameToTargetEntity.TryGetValue(logicalName, out var targetEntity);

                columns.Add(new EntityColumnInfo
                {
                    LogicalName  = logicalName,
                    PropertyName = prop.Identifier.Text,
                    DisplayName  = displayNameAttr is not null ? GetAttributeStringArg(displayNameAttr) : null,
                    DataType     = dataType,
                    EnumMembers  = _enumCache.TryGetValue(enumTypeName, out var members) ? members : null,
                    TargetEntity = targetEntity,
                });
            }

            _cache[entityName] = columns;
        }
    }

    /// <summary>
    /// Returns the simple (non-generic) type name from a property type syntax.
    /// For IEnumerable&lt;Account&gt; returns "Account"; for Account returns "Account"; for Account? returns "Account".
    /// </summary>
    private static string? GetSimpleTypeName(TypeSyntax type)
    {
        // Unwrap nullable: Account?
        if (type is NullableTypeSyntax nullable)
            type = nullable.ElementType;

        // Simple identifier: Account
        if (type is IdentifierNameSyntax id)
            return id.Identifier.Text;

        // Generic: IEnumerable<Account>
        if (type is GenericNameSyntax generic && generic.TypeArgumentList.Arguments.Count == 1)
            return GetSimpleTypeName(generic.TypeArgumentList.Arguments[0]);

        return null;
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
