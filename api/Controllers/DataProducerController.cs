using TestEngine.Models.Requests;
using TestEngine.Services;

namespace TestEngine.Controllers;

public static class DataProducerController
{
    public static void MapDataProducerEndpoints(this WebApplication app)
    {
        var group = app.MapGroup("/producers")
            .WithTags("Data Producers");

        group.MapGet("/", GetAllProducers)
            .WithName("GetAllProducers")
            .WithDescription("List all existing producers in DSL format for frontend display");

        group.MapGet("/{entityName}", GetProducer)
            .WithName("GetProducer")
            .WithDescription("Get a single producer by entity name");

        group.MapPut("/", CreateProducer)
            .WithName("CreateProducer")
            .WithDescription("Create a new DataProducer.<EntityName>.cs partial class from DSL");

        group.MapPost("/", UpdateProducer)
            .WithName("UpdateProducer")
            .WithDescription("Update an existing producer from DSL");
    }

    private static async Task<IResult> GetAllProducers(IDataProducerService dataProducerService)
    {
        try
        {
            var producers = await dataProducerService.GetAllProducersAsync();
            return Results.Ok(producers);
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

    private static async Task<IResult> GetProducer(string entityName, IDataProducerService dataProducerService)
    {
        try
        {
            var producer = await dataProducerService.GetProducerAsync(entityName);
            if (producer == null)
                return Results.NotFound($"Not found: producer for entity '{entityName}'");
            return Results.Ok(producer);
        }
        catch (Exception ex)
        {
            return Results.Problem($"Internal error: {ex.Message}");
        }
    }

    private static async Task<IResult> CreateProducer(CreateProducerRequest request, IDataProducerService dataProducerService)
    {
        try
        {
            await dataProducerService.CreateProducerAsync(request.Code);
            return Results.Ok(new { message = "Producer created successfully" });
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

    private static async Task<IResult> UpdateProducer(UpdateProducerRequest request, IDataProducerService dataProducerService)
    {
        try
        {
            await dataProducerService.UpdateProducerAsync(request.EntityName, request.Code);
            return Results.Ok(new { message = "Producer updated successfully" });
        }
        catch (NotImplementedException ex)
        {
            return Results.Problem($"Not implemented: {ex.Message}", statusCode: 501);
        }
        catch (FileNotFoundException)
        {
            return Results.NotFound($"Not found: producer for entity '{request.EntityName}'");
        }
        catch (Exception ex)
        {
            return Results.Problem($"Internal error: {ex.Message}");
        }
    }
}
