using Microsoft.OpenApi.Models;
using TestEngine.Middleware;
using TestEngine.Services;
using TestEngine.Controllers;

var builder = WebApplication.CreateBuilder(args);

// Load optional local settings (git-ignored)
builder.Configuration.AddJsonFile("appsettings.Local.json", optional: true, reloadOnChange: true);

// Add services to the container
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen(options =>
{
    options.AddSecurityDefinition("ApiKey", new OpenApiSecurityScheme
    {
        In = ParameterLocation.Header,
        Name = "X-Api-Key",
        Type = SecuritySchemeType.ApiKey,
        Description = "API key needed to access the endpoints"
    });
    options.AddSecurityRequirement(new OpenApiSecurityRequirement
    {
        {
            new OpenApiSecurityScheme
            {
                Reference = new OpenApiReference
                {
                    Type = ReferenceType.SecurityScheme,
                    Id = "ApiKey"
                }
            },
            Array.Empty<string>()
        }
    });
});

// Register configuration
builder.Services.Configure<DataverseOptions>(builder.Configuration.GetSection("Dataverse"));
builder.Services.Configure<MetadataToolsOptions>(builder.Configuration.GetSection("MetadataTools"));

// Register services
builder.Services.AddSingleton<TestProjectPaths>();
builder.Services.AddSingleton<IGitService, GitService>();
builder.Services.AddSingleton<IMetadataService, MetadataService>();
builder.Services.AddSingleton<ITestService, TestService>();
builder.Services.AddSingleton<ITestRunnerService, TestRunnerService>();
builder.Services.AddSingleton<IDslCompilerService, DslCompilerService>();
builder.Services.AddSingleton<IDataProducerService, DataProducerService>();
builder.Services.AddSingleton<IDataExtensionsService, DataExtensionsService>();
builder.Services.AddSingleton<IFileManagerService, FileManagerService>();

var app = builder.Build();

// Configure the HTTP request pipeline
if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
}

app.UseHttpsRedirection();

// Add API Key middleware
app.UseMiddleware<ApiKeyMiddleware>();

// Map endpoints
app.MapGitEndpoints();
app.MapMetadataEndpoints();
app.MapTestEndpoints();
app.MapDataProducerEndpoints();
app.MapDataExtensionsEndpoints();

app.Run();
