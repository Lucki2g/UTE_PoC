using System.Collections.Concurrent;
using Microsoft.CodeAnalysis.CSharp;
using Microsoft.CodeAnalysis.CSharp.Syntax;

namespace TestEngine.Services;

public class EntitySchemaService : IEntitySchemaService
{
    private readonly TestProjectPaths _paths;
    private readonly ConcurrentDictionary<string, List<EntityColumnInfo>> _cache = new(StringComparer.OrdinalIgnoreCase);
    private Dictionary<string, List<string>> _enumCache = new(StringComparer.OrdinalIgnoreCase);
    /// <summary>Maps C# class name → entity logical name (populated during parse).</summary>
    private Dictionary<string, string> _classNameToLogicalName = new(StringComparer.OrdinalIgnoreCase);
    /// <summary>Maps entity logical name → actual Xrm Set property name (e.g. "connection" → "ConnectionSet").</summary>
    private Dictionary<string, string> _logicalNameToSetProperty = new(StringComparer.OrdinalIgnoreCase);
    private DateTime _parsedAt = DateTime.MinValue;
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
        // Return the actual Xrm Set property names (e.g. "ConnectionSet") so consumers
        // can use them verbatim in generated code. Fall back to "<logicalName>Set" for any
        // entity that has columns but no matching Xrm Set property.
        var setNames = _cache.Keys
            .Select(k => _logicalNameToSetProperty.TryGetValue(k, out var setName) ? setName : k + "Set")
            .OrderBy(n => n)
            .ToList();
        return Task.FromResult(setNames);
    }

    public Task<string?> ResolveEntityLogicalNameAsync(string entityIdentifier)
    {
        EnsureParsed();

        // Strip "Set" suffix if present (e.g. "ape_orderSet" / "ConnectionSet" → stripped name)
        var stripped = entityIdentifier.EndsWith("Set", StringComparison.OrdinalIgnoreCase)
            ? entityIdentifier[..^3]
            : entityIdentifier;

        // Direct logical name match (cache is OrdinalIgnoreCase)
        if (_cache.ContainsKey(stripped))
            return Task.FromResult<string?>(stripped);

        // C# class name match (e.g. "Connection" / "Orderdelivery" → "connection" / "ape_orderdelivery")
        if (_classNameToLogicalName.TryGetValue(stripped, out var logicalName))
            return Task.FromResult<string?>(logicalName);

        return Task.FromResult<string?>(null);
    }

    public void InvalidateCache()
    {
        lock (_parseLock)
        {
            _parsedAt = DateTime.MinValue;
        }
    }

    private void EnsureParsed()
    {
        var filePath = Path.Combine(_paths.RepositoryPath, "src", "Shared", "SharedContext", "XrmContext.cs");
        var lastWrite = File.Exists(filePath) ? File.GetLastWriteTimeUtc(filePath) : DateTime.MinValue;

        if (_parsedAt >= lastWrite && _parsedAt != DateTime.MinValue) return;

        lock (_parseLock)
        {
            if (_parsedAt >= lastWrite && _parsedAt != DateTime.MinValue) return;
            _cache.Clear();
            ParseXrmContext();
            _parsedAt = lastWrite != DateTime.MinValue ? lastWrite : DateTime.UtcNow;
        }
    }

    private void ParseXrmContext()
    {
        var filePath = Path.Combine(_paths.RepositoryPath, "src", "Shared", "SharedContext", "XrmContext.cs");
        if (!File.Exists(filePath)) return;

        var code = File.ReadAllText(filePath);
        var tree = CSharpSyntaxTree.ParseText(code);
        var root = tree.GetCompilationUnitRoot();
        _logicalNameToSetProperty = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);

        // Parse all enum declarations first so we can attach members to columns
        foreach (var enumDecl in root.DescendantNodes().OfType<EnumDeclarationSyntax>())
        {
            var members = enumDecl.Members.Select(m => m.Identifier.Text).ToList();
            _enumCache[enumDecl.Identifier.Text] = members;
        }

        // First pass: build map of C# class name → entity logical name
        var classNameToEntityLogicalName = _classNameToLogicalName = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
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

        // Parse the Xrm context class to map logical names → actual Set property names.
        // The Xrm class has properties like: public IQueryable<Connection> ConnectionSet { ... }
        // We match the generic type argument back to a known entity logical name.
        foreach (var classDecl in root.DescendantNodes().OfType<ClassDeclarationSyntax>())
        {
            // Target the class that extends ExtendedOrganizationServiceContext (the Xrm class)
            var baseTypes = classDecl.BaseList?.Types.Select(t => t.Type.ToString()) ?? [];
            if (!baseTypes.Any(b => b.Contains("OrganizationServiceContext"))) continue;

            foreach (var prop in classDecl.Members.OfType<PropertyDeclarationSyntax>())
            {
                var propName = prop.Identifier.Text;
                if (!propName.EndsWith("Set", StringComparison.Ordinal)) continue;

                // Extract the entity class name from IQueryable<EntityClass>
                var entityClassName = GetSimpleTypeName(prop.Type);
                if (entityClassName == null) continue;

                // Resolve to logical name via the class→logical map
                if (!classNameToEntityLogicalName.TryGetValue(entityClassName, out var logicalName)) continue;

                _logicalNameToSetProperty[logicalName] = propName;
            }
            break; // Only one Xrm context class expected
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
