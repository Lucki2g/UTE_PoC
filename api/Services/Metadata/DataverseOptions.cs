namespace TestEngine.Services;

public class DataverseOptions
{
    public string Url { get; set; } = string.Empty;
    public string ClientId { get; set; } = string.Empty;
    public string ClientSecret { get; set; } = string.Empty;

    public string BuildConnectionString(string? urlOverride = null)
    {
        var url = urlOverride ?? Url;

        if (string.IsNullOrWhiteSpace(url))
            throw new InvalidOperationException("Dataverse URL is not configured. Set Dataverse:Url in appsettings or pass an environment URL in the request.");

        if (string.IsNullOrWhiteSpace(ClientId) || string.IsNullOrWhiteSpace(ClientSecret))
            throw new InvalidOperationException("Dataverse ClientId and ClientSecret must be configured in appsettings.");

        return $"AuthType=ClientSecret;url={url};ClientId={ClientId};ClientSecret={ClientSecret}";
    }
}
