using TestEngine.Middleware;
using TestEngine.Services;
using TestEngine.Controllers;

var builder = WebApplication.CreateBuilder(args);

// Add services to the container
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();

// Register services
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
