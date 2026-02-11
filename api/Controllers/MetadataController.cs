using TestEngine.Models.Requests;
using TestEngine.Services;

namespace TestEngine.Controllers;

public static class MetadataController
{
    public static void MapMetadataEndpoints(this WebApplication app)
    {
        var group = app.MapGroup("/metadata")
            .WithTags("Metadata");

        group.MapPost("/sync", SyncMetadata)
            .WithName("SyncMetadata")
            .WithDescription("Run XrmContext and metadata generators against the Dataverse environment");
    }

    private static async Task<IResult> SyncMetadata(SyncMetadataRequest? request, IMetadataService metadataService)
    {
        try
        {
            await metadataService.SyncMetadataAsync(request?.EnvironmentUrl);
            return Results.Ok(new { message = "Metadata synchronized successfully" });
        }
        catch (NotImplementedException ex)
        {
            return Results.Problem($"Not implemented: {ex.Message}", statusCode: 501);
        }
        catch (Exception ex)
        {
            return Results.Problem($"Internal error: {ex.Message}");
        }
    }
}
