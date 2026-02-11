using TestEngine.Models.Requests;
using TestEngine.Services;

namespace TestEngine.Controllers;

public static class TestController
{
    public static void MapTestEndpoints(this WebApplication app)
    {
        var group = app.MapGroup("/tests")
            .WithTags("Tests");

        group.MapGet("/", GetAllTests)
            .WithName("GetAllTests")
            .WithDescription("Return metadata and DSL for all test cases");

        group.MapPut("/", CreateTest)
            .WithName("CreateTest")
            .WithDescription("Create a new test case class extending TestBase based on DSL");

        group.MapPost("/", UpdateTest)
            .WithName("UpdateTest")
            .WithDescription("Update an existing test case from DSL");

        group.MapDelete("/", DeleteTest)
            .WithName("DeleteTest")
            .WithDescription("Delete a test case file from the branch");

        group.MapPost("/run", RunTest)
            .WithName("RunTest")
            .WithDescription("Run a specific test and return the result with trace");

        group.MapPost("/run/all", RunAllTests)
            .WithName("RunAllTests")
            .WithDescription("Run all tests and return aggregated results");
    }

    private static async Task<IResult> GetAllTests(ITestService testService)
    {
        try
        {
            var tests = await testService.GetAllTestsAsync();
            return Results.Ok(tests);
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

    private static async Task<IResult> CreateTest(CreateTestRequest request, ITestService testService)
    {
        try
        {
            await testService.CreateTestAsync(request.Code);
            return Results.Ok(new { message = "Test created successfully" });
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

    private static async Task<IResult> UpdateTest(UpdateTestRequest request, ITestService testService)
    {
        try
        {
            await testService.UpdateTestAsync(request.ClassName, request.Code);
            return Results.Ok(new { message = "Test updated successfully" });
        }
        catch (NotImplementedException ex)
        {
            return Results.Problem($"Not implemented: {ex.Message}", statusCode: 501);
        }
        catch (FileNotFoundException)
        {
            return Results.NotFound($"Not found: test class '{request.ClassName}'");
        }
        catch (Exception ex)
        {
            return Results.Problem($"Internal error: {ex.Message}");
        }
    }

    private static async Task<IResult> DeleteTest(DeleteTestRequest request, ITestService testService)
    {
        try
        {
            await testService.DeleteTestAsync(request.ClassName);
            return Results.Ok(new { message = "Test deleted successfully" });
        }
        catch (FileNotFoundException)
        {
            return Results.NotFound($"Not found: test class '{request.ClassName}'");
        }
        catch (Exception ex)
        {
            return Results.Problem($"Internal error: {ex.Message}");
        }
    }

    private static async Task<IResult> RunTest(RunTestRequest request, ITestRunnerService testRunnerService)
    {
        try
        {
            var result = await testRunnerService.RunTestAsync(request.TestName);
            return Results.Ok(result);
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

    private static async Task<IResult> RunAllTests(ITestRunnerService testRunnerService)
    {
        try
        {
            var result = await testRunnerService.RunAllTestsAsync();
            return Results.Ok(result);
        }
        catch (Exception ex)
        {
            return Results.Problem($"Internal error: {ex.Message}");
        }
    }
}
