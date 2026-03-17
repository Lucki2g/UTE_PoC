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

        app.MapGet("/workflows/{name}", GetWorkflow)
            .WithTags("Workflows")
            .WithName("GetWorkflow")
            .WithDescription("Returns the JSON content of a specific workflow file");
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

    private static IResult GetWorkflow(string name, TestProjectPaths paths)
    {
        var workflowsDir = Path.Combine(paths.RepositoryPath, "test", "SharedTest", "Workflows");
        var safeName = Path.GetFileName(name); // prevent path traversal
        var filePath = Path.Combine(workflowsDir, safeName + ".json");

        if (!File.Exists(filePath))
            return Results.NotFound();

        var content = File.ReadAllText(filePath);
        return Results.Text(content, "application/json");
    }
}
