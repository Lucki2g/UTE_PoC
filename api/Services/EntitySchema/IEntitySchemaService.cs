namespace TestEngine.Services;

public interface IEntitySchemaService
{
    Task<List<EntityColumnInfo>> GetColumnsAsync(string entityLogicalName);
    Task<List<string>> GetEntityNamesAsync();
    /// <summary>
    /// Resolves an entity identifier (logical name, C# class name, or Set-suffixed name) to the
    /// logical entity name used as the schema cache key. Returns null if no match is found.
    /// </summary>
    Task<string?> ResolveEntityLogicalNameAsync(string entityIdentifier);
    /// <summary>Clears the parsed schema cache so it is re-read from disk on next access.</summary>
    void InvalidateCache();
}

public class EntityColumnInfo
{
    public required string LogicalName { get; set; }
    /// <summary>The C# property name as declared in XrmContext (may differ in casing from LogicalName).</summary>
    public required string PropertyName { get; set; }
    public string? DisplayName { get; set; }
    public required string DataType { get; set; }
    public List<string>? EnumMembers { get; set; }
    /// <summary>For EntityReference columns: the target entity logical name, if known.</summary>
    public string? TargetEntity { get; set; }
}
