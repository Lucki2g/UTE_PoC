namespace TestEngine.Services;

public class TestProjectPaths
{
    public string RepositoryPath { get; }
    public string TestProjectPath { get; }
    public string DataProducersPath { get; }
    public string DataExtensionsPath { get; }
    public string SharedTestProjItemsPath { get; }

    public TestProjectPaths(IWebHostEnvironment env, IConfiguration config)
    {
        RepositoryPath = Path.Combine(env.ContentRootPath, "data", "repository");
        var testRel = config["TestProject:TestProjectPath"] ?? "Tests";
        var producersRel = config["TestProject:DataProducersPath"] ?? "Tests\\DataProducers";
        var extensionsRel = config["TestProject:DataExtensionsPath"] ?? "Tests\\DataExtensions";
        var projItemsRel = config["TestProject:SharedTestProjItemsPath"] ?? "test\\SharedTest\\SharedTest.projitems";
        TestProjectPath = Path.Combine(RepositoryPath, testRel);
        DataProducersPath = Path.Combine(RepositoryPath, producersRel);
        DataExtensionsPath = Path.Combine(RepositoryPath, extensionsRel);
        SharedTestProjItemsPath = Path.Combine(RepositoryPath, projItemsRel);
    }
}
