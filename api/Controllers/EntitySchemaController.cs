using TestEngine.Services;

namespace TestEngine.Controllers;

public static class EntitySchemaController
{
    public static void MapEntitySchemaEndpoints(this WebApplication app)
    {
        var group = app.MapGroup("/schema")
            .WithTags("Schema");

        group.MapGet("/entities/{entityName}/columns", GetColumns)
            .WithName("GetEntityColumns")
            .WithDescription("Get column definitions for a Dataverse entity from the generated XrmContext");
    }

    private static async Task<IResult> GetColumns(string entityName, IEntitySchemaService schemaService)
    {
        var columns = await schemaService.GetColumnsAsync(entityName);
        if (columns.Count == 0)
            return Results.NotFound(new { message = $"Entity '{entityName}' not found in XrmContext" });

        return Results.Ok(columns);
    }
}
