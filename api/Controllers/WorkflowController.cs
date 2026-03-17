using TestEngine.Services;

namespace TestEngine.Controllers;

public static class WorkflowController
{
    public static void MapWorkflowEndpoints(this WebApplication app)
    {
        app.MapGet("/workflows", GetWorkflows)
            .WithTags("Workflows")
            .WithName("GetWorkflows")
            .WithDescription("Returns the names of available Power Automate workflow files from the repository");
    }

    private static IResult GetWorkflows(TestProjectPaths paths)
    {
        var workflowsDir = Path.Combine(paths.RepositoryPath, "test", "SharedTest", "Workflows");

        if (!Directory.Exists(workflowsDir))
            return Results.Ok(Array.Empty<string>());

        var names = Directory
            .GetFiles(workflowsDir, "*.json")
            .Select(f => Path.GetFileNameWithoutExtension(f))
            .OrderBy(n => n)
            .ToArray();

        return Results.Ok(names);
    }
}
