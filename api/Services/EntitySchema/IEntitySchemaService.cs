namespace TestEngine.Services;

public interface IEntitySchemaService
{
    Task<List<EntityColumnInfo>> GetColumnsAsync(string entityLogicalName);
    Task<List<string>> GetEntityNamesAsync();
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
