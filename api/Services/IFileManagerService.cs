namespace TestEngine.Services;

public interface IFileManagerService
{
    Task<string> ReadFileAsync(string filePath);
    Task WriteFileAsync(string filePath, string content);
    Task DeleteFileAsync(string filePath);
    bool FileExists(string filePath);
    IEnumerable<string> GetFiles(string directory, string pattern, bool recursive = true);
}
