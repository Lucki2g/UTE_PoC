using TestEngine.Models.Requests;
using TestEngine.Services;

namespace TestEngine.Controllers;

public static class GitController
{
    public static void MapGitEndpoints(this WebApplication app)
    {
        var group = app.MapGroup("/git")
            .WithTags("Git");

        group.MapPost("/clone", CloneRepository)
            .WithName("CloneRepository")
            .WithDescription("Clone the consumer repository to the local data directory");

        group.MapGet("/status", GetStatus)
            .WithName("GetStatus")
            .WithDescription("Return the current repository status (branch, clean/dirty, clone state)");

        group.MapPost("/load", LoadBranch)
            .WithName("LoadBranch")
            .WithDescription("Load (checkout) a branch as the current working branch");

        group.MapPost("/new", CreateNewBranch)
            .WithName("CreateNewBranch")
            .WithDescription("Fetch + pull from main, then create a new branch from main");

        group.MapPost("/save", SaveChanges)
            .WithName("SaveChanges")
            .WithDescription("Stage and commit changes on the current branch");

        group.MapPost("/publish", PublishBranch)
            .WithName("PublishBranch")
            .WithDescription("Push the current branch to the remote");

        group.MapPost("/submit", CreatePullRequest)
            .WithName("CreatePullRequest")
            .WithDescription("Create a pull request from the current branch to a target branch");
    }

    private static async Task<IResult> CloneRepository(CloneRepositoryRequest request, IGitService gitService)
    {
        try
        {
            var result = await gitService.CloneRepositoryAsync(request.RepositoryUrl);
            return Results.Ok(result);
        }
        catch (InvalidOperationException ex) when (ex.Message.Contains("already cloned"))
        {
            return Results.Conflict(ex.Message);
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

    private static async Task<IResult> GetStatus(IGitService gitService)
    {
        try
        {
            var status = await gitService.GetStatusAsync();
            return Results.Ok(status);
        }
        catch (Exception ex)
        {
            return Results.Problem($"Internal error: {ex.Message}");
        }
    }

    private static async Task<IResult> LoadBranch(LoadBranchRequest request, IGitService gitService)
    {
        try
        {
            await gitService.LoadBranchAsync(request.BranchName);
            return Results.Ok(new { message = $"Switched to branch '{request.BranchName}'" });
        }
        catch (InvalidOperationException ex) when (ex.Message.Contains("not initialized"))
        {
            return Results.BadRequest(ex.Message);
        }
        catch (FileNotFoundException)
        {
            return Results.NotFound($"Not found: branch '{request.BranchName}'");
        }
        catch (Exception ex)
        {
            return Results.Problem($"Internal error: {ex.Message}");
        }
    }

    private static async Task<IResult> CreateNewBranch(CreateBranchRequest request, IGitService gitService)
    {
        try
        {
            await gitService.CreateNewBranchAsync(request.BranchName);
            return Results.Ok(new { message = $"Created and switched to branch '{request.BranchName}'" });
        }
        catch (InvalidOperationException ex) when (ex.Message.Contains("not initialized"))
        {
            return Results.BadRequest(ex.Message);
        }
        catch (InvalidOperationException ex) when (ex.Message.Contains("already exists"))
        {
            return Results.Conflict(ex.Message);
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

    private static async Task<IResult> SaveChanges(SaveChangesRequest request, IGitService gitService)
    {
        try
        {
            await gitService.SaveChangesAsync(request.Message);
            return Results.Ok(new { message = "Changes committed successfully" });
        }
        catch (InvalidOperationException ex) when (ex.Message.Contains("not initialized"))
        {
            return Results.BadRequest(ex.Message);
        }
        catch (InvalidOperationException ex) when (ex.Message.Contains("Nothing to commit"))
        {
            return Results.BadRequest("Bad request: nothing to commit");
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

    private static async Task<IResult> PublishBranch(IGitService gitService)
    {
        try
        {
            await gitService.PublishBranchAsync();
            var currentBranch = await gitService.GetCurrentBranchAsync();
            return Results.Ok(new { message = $"Branch '{currentBranch}' pushed to remote" });
        }
        catch (InvalidOperationException ex) when (ex.Message.Contains("not initialized"))
        {
            return Results.BadRequest(ex.Message);
        }
        catch (Exception ex) when (ex.Message.Contains("rejected"))
        {
            return Results.Conflict($"Push rejected: {ex.Message}");
        }
        catch (Exception ex)
        {
            return Results.Problem($"Internal error: {ex.Message}");
        }
    }

    private static async Task<IResult> CreatePullRequest(SubmitRequest request, IGitService gitService)
    {
        try
        {
            var prUrl = await gitService.CreatePullRequestAsync(request.TargetBranch, request.Title, request.Description ?? "");
            return Results.Ok(new { message = "Pull request created", url = prUrl });
        }
        catch (InvalidOperationException ex) when (ex.Message.Contains("not initialized"))
        {
            return Results.BadRequest(ex.Message);
        }
        catch (InvalidOperationException ex) when (ex.Message.Contains("no remote"))
        {
            return Results.BadRequest($"Bad request: {ex.Message}");
        }
        catch (InvalidOperationException ex) when (ex.Message.Contains("already exists"))
        {
            return Results.Conflict($"Conflict: {ex.Message}");
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
