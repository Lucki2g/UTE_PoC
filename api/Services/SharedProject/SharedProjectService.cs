using System.Xml.Linq;

namespace TestEngine.Services;

public class SharedProjectService : ISharedProjectService
{
    private static readonly XNamespace Ns = "http://schemas.microsoft.com/developer/msbuild/2003";

    public async Task AddCompileItemAsync(string projItemsPath, string includeRelativePath)
    {
        var xml = await File.ReadAllTextAsync(projItemsPath);
        var doc = XDocument.Parse(xml, LoadOptions.PreserveWhitespace);

        var itemGroups = doc.Root!.Elements(Ns + "ItemGroup").ToList();

        // Find the ItemGroup that already contains Compile elements
        var compileGroup = itemGroups.FirstOrDefault(g => g.Elements(Ns + "Compile").Any());
        if (compileGroup == null)
        {
            compileGroup = new XElement(Ns + "ItemGroup");
            doc.Root.Add(compileGroup);
        }

        // Check if this entry already exists
        var alreadyIncluded = compileGroup
            .Elements(Ns + "Compile")
            .Any(e => string.Equals(
                e.Attribute("Include")?.Value,
                includeRelativePath,
                StringComparison.OrdinalIgnoreCase));

        if (alreadyIncluded)
            return;

        var newElement = new XElement(Ns + "Compile",
            new XAttribute("Include", includeRelativePath));

        // Insert after the last existing Compile element
        var lastCompile = compileGroup.Elements(Ns + "Compile").LastOrDefault();
        if (lastCompile != null)
            lastCompile.AddAfterSelf(new XText("\n    "), newElement);
        else
            compileGroup.Add(newElement);

        await File.WriteAllTextAsync(projItemsPath, doc.Declaration != null
            ? doc.Declaration + "\n" + doc.Root
            : doc.ToString());
    }
}
