namespace TestEngine.Services;

public class FileManagerService : IFileManagerService
{
    public async Task<string> ReadFileAsync(string filePath)
    {
        if (!File.Exists(filePath))
        {
            throw new FileNotFoundException($"File not found: {filePath}");
        }

        return await File.ReadAllTextAsync(filePath);
    }

    public async Task WriteFileAsync(string filePath, string content)
    {
        var directory = Path.GetDirectoryName(filePath);
        if (!string.IsNullOrEmpty(directory) && !Directory.Exists(directory))
        {
            Directory.CreateDirectory(directory);
        }

        await File.WriteAllTextAsync(filePath, content);
    }

    public Task DeleteFileAsync(string filePath)
    {
        if (!File.Exists(filePath))
        {
            throw new FileNotFoundException($"File not found: {filePath}");
        }

        File.Delete(filePath);
        return Task.CompletedTask;
    }

    public bool FileExists(string filePath)
    {
        return File.Exists(filePath);
    }

    public IEnumerable<string> GetFiles(string directory, string pattern, bool recursive = true)
    {
        if (!Directory.Exists(directory))
        {
            return Enumerable.Empty<string>();
        }

        var searchOption = recursive ? SearchOption.AllDirectories : SearchOption.TopDirectoryOnly;
        return Directory.GetFiles(directory, pattern, searchOption);
    }
}
