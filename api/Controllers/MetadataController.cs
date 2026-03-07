using System.Text.Json;
using System.Text.Json.Serialization;
using TestEngine.Models.Requests;
using TestEngine.Services;

namespace TestEngine.Controllers;

public static class MetadataController
{
    private static readonly JsonSerializerOptions SseJsonOptions = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        Converters = { new JsonStringEnumConverter(JsonNamingPolicy.CamelCase) },
    };

    public static void MapMetadataEndpoints(this WebApplication app)
    {
        var group = app.MapGroup("/metadata")
            .WithTags("Metadata");

        group.MapPost("/sync", SyncMetadata)
            .WithName("SyncMetadata")
            .WithDescription("Run XrmContext and metadata generators against the Dataverse environment");

        group.MapGet("/sync/stream", SyncMetadataStream)
            .WithName("SyncMetadataStream")
            .WithDescription("Stream sync progress as Server-Sent Events (phase started / complete / error)");
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

    // GET /metadata/sync/stream?environmentUrl=...
    // Streams Server-Sent Events: data: { phase, status, message, detail? }\n\n
    private static async Task SyncMetadataStream(
        HttpContext httpContext,
        IMetadataService metadataService,
        string? environmentUrl = null)
    {
        httpContext.Response.ContentType = "text/event-stream";
        httpContext.Response.Headers.CacheControl = "no-cache";
        httpContext.Response.Headers.Connection = "keep-alive";

        var ct = httpContext.RequestAborted;

        await foreach (var evt in metadataService.SyncMetadataStreamAsync(environmentUrl, ct))
        {
            if (ct.IsCancellationRequested) break;

            var json = JsonSerializer.Serialize(evt, SseJsonOptions);
            await httpContext.Response.WriteAsync($"data: {json}\n\n", ct);
            await httpContext.Response.Body.FlushAsync(ct);
        }

        // Signal the client that the stream is done
        await httpContext.Response.WriteAsync("data: {\"done\":true}\n\n", ct);
        await httpContext.Response.Body.FlushAsync(ct);
    }
}
