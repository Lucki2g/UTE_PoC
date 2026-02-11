using TestEngine.Models.Requests;
using TestEngine.Services;

namespace TestEngine.Controllers;

public static class DataExtensionsController
{
    public static void MapDataExtensionsEndpoints(this WebApplication app)
    {
        var group = app.MapGroup("/extensions")
            .WithTags("Data Extensions");

        group.MapGet("/", GetAllExtensions)
            .WithName("GetAllExtensions")
            .WithDescription("List all existing extensions for frontend display");

        group.MapPut("/", CreateExtension)
            .WithName("CreateExtension")
            .WithDescription("Create a new DataExtensions.<EntityName>.cs partial class");

        group.MapPost("/", UpdateExtension)
            .WithName("UpdateExtension")
            .WithDescription("Update an existing extensions class");

        group.MapDelete("/", DeleteExtension)
            .WithName("DeleteExtension")
            .WithDescription("Remove an extensions file");
    }

    private static async Task<IResult> GetAllExtensions(IDataExtensionsService dataExtensionsService)
    {
        try
        {
            var extensions = await dataExtensionsService.GetAllExtensionsAsync();
            return Results.Ok(extensions);
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

    private static async Task<IResult> CreateExtension(CreateExtensionRequest request, IDataExtensionsService dataExtensionsService)
    {
        try
        {
            await dataExtensionsService.CreateExtensionAsync(request.Code);
            return Results.Ok(new { message = "Extension created successfully" });
        }
        catch (NotImplementedException ex)
        {
            return Results.Problem($"Not implemented: {ex.Message}", statusCode: 501);
        }
        catch (ArgumentException ex)
        {
            return Results.BadRequest($"Bad request: {ex.Message}");
        }
        catch (Exception ex)
        {
            return Results.Problem($"Internal error: {ex.Message}");
        }
    }

    private static async Task<IResult> UpdateExtension(UpdateExtensionRequest request, IDataExtensionsService dataExtensionsService)
    {
        try
        {
            await dataExtensionsService.UpdateExtensionAsync(request.EntityName, request.Code);
            return Results.Ok(new { message = "Extension updated successfully" });
        }
        catch (NotImplementedException ex)
        {
            return Results.Problem($"Not implemented: {ex.Message}", statusCode: 501);
        }
        catch (FileNotFoundException)
        {
            return Results.NotFound($"Not found: extension for entity '{request.EntityName}'");
        }
        catch (Exception ex)
        {
            return Results.Problem($"Internal error: {ex.Message}");
        }
    }

    private static async Task<IResult> DeleteExtension(DeleteExtensionRequest request, IDataExtensionsService dataExtensionsService)
    {
        try
        {
            await dataExtensionsService.DeleteExtensionAsync(request.EntityName);
            return Results.Ok(new { message = "Extension deleted successfully" });
        }
        catch (FileNotFoundException)
        {
            return Results.NotFound($"Not found: extension for entity '{request.EntityName}'");
        }
        catch (Exception ex)
        {
            return Results.Problem($"Internal error: {ex.Message}");
        }
    }
}
