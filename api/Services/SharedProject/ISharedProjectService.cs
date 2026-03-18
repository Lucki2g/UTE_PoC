namespace TestEngine.Services;

public interface ISharedProjectService
{
    Task AddCompileItemAsync(string projItemsPath, string includeRelativePath);
}
