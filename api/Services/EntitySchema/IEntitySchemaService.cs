namespace TestEngine.Services;

public interface IEntitySchemaService
{
    Task<List<EntityColumnInfo>> GetColumnsAsync(string entityLogicalName);
}

public class EntityColumnInfo
{
    public required string LogicalName { get; set; }
    public string? DisplayName { get; set; }
    public required string DataType { get; set; }
    public List<string>? EnumMembers { get; set; }
}
