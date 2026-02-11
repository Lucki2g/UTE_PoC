# Test Engine API — Feature Definition

## 1. Core Infrastructure & Purpose

### Purpose

The Test Engine API is a .NET 10 C# Minimal API that serves as the backend for a **low-code / pro-code shared testing platform** built on top of the Dataverse / Power Platform ecosystem.

**The problem it solves:** In organizations using both Power Platform (low-code) and traditional .NET development (pro-code), testing is fragmented. Pro-code developers write XrmMockup-based unit tests in C#, while low-code developers have no structured way to author, manage, or run tests against customizations they build in Dataverse.

**The solution:** The Test Engine bridges this gap. Low-code developers author tests through a Power Platform canvas/model-driven app that sends structured JSON (a DSL) to this API. The API compiles that DSL into real C# unit test classes that live alongside the pro-code tests in the same repository. Both worlds share one codebase, one test runner, and one CI/CD pipeline.

The API manages the full lifecycle:
- **Git operations** — branching, committing, and pull requests so low-code developers can safely contribute test code to the shared repo without direct Git access.
- **Metadata sync** — keeping early-bound Dataverse types and security metadata current via XrmContext, the XrmMockup Metadata Generator, and PAMU_CDS for Power Automate flow testing.
- **Test CRUD & execution** — creating, updating, deleting, and running C# unit test classes that extend a shared `TestBase`.
- **Test data management** — managing Data Producers (entity initialization with required fields) and Data Extensions (fluent builder methods on `Draft<T>`) that follow the Arrange-Act-Assert pattern.
- **DSL com-/decompilation** — transforming JSON-based test definitions from the Power Platform app into valid C# test classes and the other way.

### Technical Foundation

| Concern | Decision |
|---|---|
| Framework | .NET 10 C# Minimal API |
| Architecture | Dependency Injection throughout. Services (logic), Models (DTOs/requests), Controllers (endpoint definitions) |
| Authentication | API Key middleware — single shared key |
| Test framework | XrmMockup for Dataverse mocking |
| Flow testing | PAMU_CDS (https://github.com/thygesteffensen/PAMU_CDS) integrated with XrmMockup |
| Metadata generation | XrmContext + XrmMockup Metadata Generator |
| Consumer repo | The API operates against an existing .NET solution repo that already has XrmMockup, XrmContext, etc. configured |

### Project Structure

```
TestEngine/
├── Controllers/
│   ├── GitController.cs
│   ├── MetadataController.cs
│   ├── TestController.cs
│   ├── DataProducerController.cs
│   └── DataExtensionsController.cs
├── Services/
│   ├── GitService.cs
│   ├── MetadataService.cs
│   ├── TestService.cs
│   ├── TestRunnerService.cs
│   ├── DslCompilerService.cs
│   ├── DataProducerService.cs
│   ├── DataExtensionsService.cs
│   └── FileManagerService.cs
├── Models/
│   ├── Requests/
│   │   ├── LoadBranchRequest.cs
│   │   ├── SubmitRequest.cs
│   │   ├── CreateTestRequest.cs
│   │   ├── RunTestRequest.cs
│   │   ├── CreateProducerRequest.cs
│   │   ├── CreateExtensionRequest.cs
│   │   └── ...
│   ├── Responses/
│   │   ├── TestRunResult.cs
│   │   ├── TestMetadata.cs
│   │   ├── ProducerMetadata.cs
│   │   ├── ExtensionMetadata.cs
│   │   └── ...
│   └── Dsl/
│       └── DslTestDefinition.cs  (JSON DSL model — to be defined later)
├── Middleware/
│   └── ApiKeyMiddleware.cs
├── Program.cs
└── appsettings.json
```

---

## 2. Authentication — API Key Middleware

### Feature

A single API key is configured in `appsettings.json` (or environment variables / secrets). A custom middleware intercepts every request, reads the `X-Api-Key` header, and compares it against the configured key. Unauthorized requests receive a `401 Unauthorized` response before reaching any endpoint.

### Behavior

- The middleware runs on **all routes** (no anonymous endpoints).
- The key is passed via the `X-Api-Key` HTTP header.
- If the key is missing → `401 Unauthorized`.
- If the key is wrong → `401 Unauthorized`.
- If the key matches → request proceeds to the endpoint.

---

## 3. Error Model

Standard HTTP error responses using built-in `Results` helpers. No custom error envelope for now.

| Scenario | Status Code | Response |
|---|---|---|
| Missing/invalid API key | `401 Unauthorized` | `"Unauthorized"` |
| Operation not permitted (e.g. push to protected branch) | `403 Forbidden` | `"Forbidden: <reason>"` |
| Resource not found (test, producer, extension, branch) | `404 Not Found` | `"Not found: <resource>"` |
| Invalid request body / missing fields | `400 Bad Request` | `"Bad request: <validation detail>"` |
| Git conflict, build failure, test compilation error | `409 Conflict` or `422 Unprocessable Entity` | `"<descriptive error>"` |
| Unexpected server error | `500 Internal Server Error` | `"Internal error: <message>"` |

---

## 4. Git Service — Technical Decision

The Git service manages branching, committing, pushing, and pull request creation against the shared test repository.

### Option A: Shelling out to Git CLI

Execute `git` commands as child processes via `Process.Start()` or `CliWrap`.

**Pros:**
- Full Git feature set — everything Git can do, the API can do.
- No library version lag; always uses whatever Git version is installed.
- Simpler for complex operations like interactive rebase, stash, sparse checkout.
- Easier debugging — you can reproduce any command manually in a terminal.
- Pull request creation already requires the GitHub/Azure DevOps REST API regardless, so there is no library advantage there.

**Cons:**
- Requires Git to be installed on the host / container.
- Process spawning has overhead and error handling is string-based (parsing stdout/stderr).
- Harder to unit test without mocking the process layer.
- Potential security risk if inputs are not sanitized (command injection).

### Option B: LibGit2Sharp

A managed .NET binding to libgit2, providing a native C# API for Git operations.

**Pros:**
- Pure C# — no external process dependency.
- Strongly typed API: branches, commits, refs are all objects.
- Easier to unit test and mock via interfaces.
- No command injection risk.

**Cons:**
- Feature gap — LibGit2Sharp does not support all Git operations (e.g. `git pull` is limited, no native rebase, no sparse checkout).
- Maintenance concerns — the library has had periods of slow maintenance and lagging behind libgit2 releases.
- Still needs the GitHub/Azure DevOps REST API for pull request creation.
- Authentication (SSH keys, credential managers) can be more complex to configure than CLI.

### Recommendation: **Git CLI via CliWrap**

For this use case, the CLI approach is more practical. The operations needed (fetch, pull, checkout, branch, add, commit, push) are straightforward CLI commands, and the API will already need to call the GitHub/Azure DevOps REST API for pull requests. CliWrap provides a clean, fluent C# wrapper around process execution with proper async support, output piping, and cancellation. Input sanitization is critical — branch names and messages must be validated/escaped.

---

## 5. Test Runner — Technical Decision

The test runner executes C# unit tests (both low-code compiled and pro-code) and returns results with traces.

### Option A: `dotnet test` as a child process

Shell out to `dotnet test` with `--filter`, `--logger`, and result parsing.

**Pros:**
- Uses the exact same runner as CI/CD — results are identical.
- Supports all test frameworks (xUnit, NUnit, MSTest) without coupling.
- TRX or JSON loggers provide structured output for parsing.
- Can run filtered tests (`--filter FullyQualifiedName=...`) or all tests.
- No in-process dependency conflicts between the API and the test project.

**Cons:**
- Cold start: `dotnet test` compiles the project on first run — can be slow.
- Process overhead per execution.
- Parsing TRX/JSON output adds complexity.
- Harder to provide real-time streaming of test progress (though `dotnet test` does support streaming loggers).

### Option B: In-process test runner (hosting xUnit/NUnit programmatically)

Load the test assembly into the API process and execute tests using the framework's runner API.

**Pros:**
- Faster execution — no process spawn or compilation step (if assembly is pre-built).
- Direct access to test results as objects — no output parsing.
- Could provide real-time progress callbacks.

**Cons:**
- **Assembly isolation is hard** — XrmMockup, Dataverse SDK, and all test dependencies load into the API's process. Version conflicts are likely.
- Tightly couples the API to a specific test framework version.
- If a test crashes or hangs, it can take down the API.
- The test project must be compiled separately anyway (`dotnet build`), so compilation time is not saved.
- Significantly more complex to implement and maintain.

### Recommendation: **`dotnet test` via CLI**

The process-based approach is safer, simpler, and more reliable for this scenario. XrmMockup tests have heavy dependencies (Dataverse SDK, metadata files, plugin assemblies), and loading those in-process alongside the API is a recipe for conflicts. Using `dotnet test --logger "trx;LogFileName=results.trx"` gives structured XML results that can be parsed into the API's response model. CliWrap can be used here as well, consistent with the Git service.

**Workflow:**
1. `dotnet build` the test project (can be cached / skipped if no changes).
2. `dotnet test --no-build --filter "FullyQualifiedName=<test>" --logger "trx;LogFileName=results.trx"` for single test.
3. `dotnet test --no-build --logger "trx;LogFileName=results.trx"` for all tests.
4. Parse the TRX file → map to `TestRunResult` response model.

---

## 6. File Management — Technical Decision

The API generates, updates, and deletes C# source files (test classes, data producers, data extensions). This requires a templating/code generation strategy.

### Option A: String interpolation / StringBuilder

Build C# source code by concatenating strings with `$"..."` or `StringBuilder`.

**Pros:**
- Zero dependencies — uses built-in .NET.
- Simple to understand and debug for small templates.
- Fast to implement for a first version.

**Cons:**
- Fragile — easy to produce invalid C# (missing braces, bad indentation, syntax errors).
- No syntax validation at generation time.
- Becomes unmaintainable as templates grow in complexity.
- Escaping user-provided content (method names, entity names) is manual.

### Option B: Roslyn (Microsoft.CodeAnalysis)

Use Roslyn's Syntax API to programmatically construct C# syntax trees, then serialize to source code.

**Pros:**
- **Guaranteed valid C# syntax** — you build an AST, not a string.
- Can also parse existing files into syntax trees for precise, safe modifications (e.g. add a method to an existing class without regex).
- Supports formatting via `Formatter.Format()` — consistent code style.
- Powerful for the DSL compiler — the JSON DSL can be walked and translated directly into Roslyn syntax nodes.
- Can validate that generated code compiles before writing to disk.

**Cons:**
- Steep learning curve — Roslyn's API is verbose (e.g. `SyntaxFactory.MethodDeclaration(...)` with many parameters).
- Heavier dependency (~10MB+ NuGet packages).
- Overkill for simple file scaffolding (creating a mostly-static class with a few variable names).
- Slower than string concat for trivial operations.

### Option C: Scriban (template engine)

Use Scriban, a lightweight .NET template engine (similar to Liquid/Handlebars), to define `.sbn` template files with placeholders.

**Pros:**
- Clean separation of template and logic — templates are readable and editable.
- Familiar syntax for anyone who has used Liquid, Handlebars, or Razor.
- Good for scaffolding (creating new files from a known structure with variable names).
- Lightweight dependency.

**Cons:**
- No syntax validation — templates produce strings, not verified C#.
- For *editing* existing files (adding a method to a class), Scriban is not helpful — it's for generating, not modifying.
- Another templating language to learn and maintain.

### Recommendation: **Hybrid — Scriban for scaffolding, Roslyn for modification and DSL compilation**

- **New file creation** (PUT endpoints): Use Scriban templates. The initial class scaffolds are well-defined structures where only a few values change (entity name, class name, namespace). Scriban makes these readable and easy to update.
- **File updates** (POST endpoints): Use Roslyn to parse the existing C# file into a syntax tree, apply modifications (add/remove/update methods), and write it back. This avoids fragile regex or string manipulation on existing code.
- **DSL compilation**: Use Roslyn — the JSON DSL maps naturally to syntax tree construction, and Roslyn can validate the output compiles correctly before writing it to disk.
- **File deletion** (DELETE endpoints): Simple `File.Delete()`.

---

## 7. DSL Compiler Service

### Feature

A dedicated `DslCompilerService` receives structured JSON from the Power Platform app representing test definitions authored by low-code developers. The service compiles this JSON into valid C# unit test classes that extend `TestBase` and integrate with XrmMockup.

### Behavior

- Input: JSON payload conforming to the DSL schema (to be defined in a separate feature specification with examples).
- Output: A valid C# source file written to the correct location in the test project on the current branch.
- Validation: The service uses Roslyn to verify the generated code compiles against the test project's references before writing.
- Errors: Compilation errors are returned as structured messages so the Power Platform app can display them to the low-code developer.

*Full DSL schema and compilation rules will be defined in a dedicated feature specification.*

---

## 8. Git Controller

The Git controller manages branching, committing, and pull requests for the shared test codebase. Low-code developers interact with Git exclusively through these endpoints — they never touch Git directly.

### Endpoints

| Endpoint | Method | Description |
|---|---|---|
| `/git/load` | POST | Load (checkout) a branch as the current working branch |
| `/git/new` | POST | Fetch + pull from main, then create a new branch from main |
| `/git/save` | POST | Stage and commit changes on the current branch |
| `/git/publish` | POST | Push the current branch to the remote |
| `/git/submit` | POST | Create a pull request from the current branch to a target branch |

### Details

**POST `/git/load`**
- Request: `{ "branchName": "feature/my-tests" }`
- Behavior: `git checkout <branchName>`. If the branch doesn't exist locally, fetch and track from remote.
- Errors: `404` if branch does not exist locally or on remote.

**POST `/git/new`**
- Request: `{ "branchName": "feature/new-tests" }`
- Behavior: `git fetch origin` → `git checkout main` → `git pull origin main` → `git checkout -b <branchName>`.
- Errors: `409` if branch name already exists.

**POST `/git/save`**
- Request: `{ "message": "Added account validation tests" }`
- Behavior: `git add .` → `git commit -m "<message>"` on the current branch.
- Errors: `400` if nothing to commit.

**POST `/git/publish`**
- Request: (empty body — operates on current branch)
- Behavior: `git push origin <currentBranch>`.
- Errors: `409` if push is rejected (e.g. behind remote).

**POST `/git/submit`**
- Request: `{ "targetBranch": "main", "title": "Add account tests", "description": "..." }`
- Behavior: Calls the GitHub / Azure DevOps REST API to create a pull request from the current branch to the target.
- Errors: `400` if current branch has no remote, `409` if a PR already exists.

---

## 9. Metadata Controller

The metadata controller synchronizes Dataverse metadata (early-bound types, security roles, Power Automate flows) from a live environment into the local codebase.

### Endpoints

| Endpoint | Method | Description |
|---|---|---|
| `/metadata/sync` | POST | Run XrmContext and metadata generators against the Dataverse environment |

### Details

**POST `/metadata/sync`**
- Request: (empty body or optional `{ "environmentUrl": "https://org.crm4.dynamics.com" }` override)
- Behavior:
  1. Run **XrmContext** to regenerate early-bound C# types for Dataverse tables/entities.
  2. Run the **XrmMockup Metadata Generator** to produce metadata files for security roles, workflows, etc.
  3. Run **PAMU_CDS** tooling to extract Power Automate flow definitions for use with XrmMockup.
- All tools should already be configured in the consumer repo. The service invokes them via CLI.
- Errors: `500` with tool output if any generator fails.

---

## 10. Test Controller

The test controller manages the full lifecycle of C# unit test classes: creation, updates, deletion, and execution. DSL is descripted inside TODO as a seperate feature. 

### Endpoints

| Endpoint | Method | Description |
|---|---|---|
| `/tests` | GET | Return metadata and DSL for all test cases (for frontend display) |
| `/tests` | PUT | Create a new test case class extending `TestBase` based on DSL |
| `/tests` | POST | Update an existing test case from DSL |
| `/tests` | DELETE | Delete a test case file from the branch |
| `/tests/run` | POST | Run a specific test and return the result with trace |
| `/tests/run/all` | POST | Run all tests and return aggregated results |

### Details

**GET `/tests`**
- Response: List of test metadata objects and translate C# to DSL (class name, file path, method names, last modified, etc.) for display in the Power Platform frontend.

**PUT `/tests`**
- Request: `{ "code": <DSL> }`
- Behavior: Scaffolds a new C# class that extends `TestBase` from DSL. The general format initializes the class with the XrmMockup test infrastructure.
- The file is created on the current branch in the correct project directory.

**POST `/tests`**
- Request: `{ "className": "AccountValidationTests"; "code": <DSL> }`
- Behavior: Parses the existing C# file with Roslyn, applies updates (add/modify/remove test methods), writes back.

**DELETE `/tests`**
- Request: `{ "className": "AccountValidationTests" }`
- Behavior: Deletes the C# file from the branch.
- Errors: `404` if the file doesn't exist.

**POST `/tests/run`**
- Request: `{ "testName": "Tests.Accounts.AccountValidationTests.Should_Create_Valid_Account" }`
- Behavior: Executes `dotnet test --filter "FullyQualifiedName=<testName>"`, parses TRX output.
- Response: `{ "passed": true, "duration": "1.2s", "trace": "...", "errorMessage": null }`

**POST `/tests/run/all`**
- Behavior: Executes `dotnet test`, parses TRX output.
- Response: `{ "total": 42, "passed": 40, "failed": 2, "results": [...] }`

---

## 11. Data Producer Controller

Data producers define the **minimum valid initialization** of a Dataverse entity for use in the Arrange step of tests. There is one `DataProducer` partial class per entity, containing a `DraftValid<Entity>()` method that creates a `Draft<T>` with all required fields set to sensible defaults. Communicates in a DSL lanugage in JSON TODO.

### Code Format

Filename: `DataProducer.<EntityName>.cs`

```csharp
internal partial class DataProducer
{
    internal IOrganizationService Service { get; }
    internal DataProducer(IOrganizationService service) => Service = service;

    internal Draft<Account> DraftValidAccount(Account account = null)
    {
        account ??= new Account();

        // Required + "minimum for our org" defaults
        account.EnsureValue(e => e.CustomerTypeCode, Account_CustomerTypeCode.Customer);
        account.EnsureValue(e => e.AccountNumber, ProduceValidCVR());
        account.EnsureValue(e => e.Name, "Per Aarsleff A/S - C");

        return new Draft<Account>(this, account);
    }
}
```

#### DSL Format
```json
{
  "draft": {
    "entity": "account",
    "useExisting": true,
    "ensure": [
      {
        "field": "customertypecode",
        "value": { "enum": "Account_CustomerTypeCode.Customer" }
      },
      {
        "field": "accountnumber",
        "value": { "gen": "ProduceValidCVR" }
      },
      {
        "field": "name",
        "value": "Per Aarsleff A/S - C"
      }
    ]
  }
}
```

### Endpoints

| Endpoint | Method | Description |
|---|---|---|
| `/producers` | GET | List all existing producers in DSL format for frontend display |
| `/producers` | PUT | Create a new `DataProducer.<EntityName>.cs` partial class from DSL |
| `/producers` | POST | Update an existing producer from DSL |

### Details

**GET `/producers`**
- Response: List of producer metadata (entity name, file path, method names, default field values).

**PUT `/producers`**
- Request: `{ "entityName": "Account", "requiredFields": [...] }`
- Behavior: Scaffolds a new partial class file using the format above with the entity's required fields populated.

**POST `/producers`**
- Request: `{ "entityName": "Account", "methods": [...] }`
- Behavior: Parses the existing file, applies updates to methods/defaults.

---

## 12. Data Extensions Controller

Data extensions provide **fluent builder methods** on `Draft<T>` as extension methods in partial classes. Each entity type has its own partial class file containing methods like `.AsDebtor()`, `.WithOwner(...)`, etc. that configure the draft entity for specific test scenarios.

### Code Format

Filename: `DataExtensions.<EntityName>.cs`

```csharp
internal static partial class DataExtensions
{
    internal static Draft<Account> AsDebtor(this Draft<Account> account)
    {
        return account.With(a => a.CustomerTypeCode = Account_CustomerTypeCode.Debtor);
    }
}
```

```json
{
  "asDebtor": {
    "entity": "account",
    "set": [
      {
        "field": "customertypecode",
        "value": { "enum": "Account_CustomerTypeCode.Debtor" }
      }
    ]
  }
}
```

### Endpoints

| Endpoint | Method | Description |
|---|---|---|
| `/extensions` | GET | List all existing extensions for frontend display |
| `/extensions` | PUT | Create a new `DataExtensions.<EntityName>.cs` partial class |
| `/extensions` | POST | Update an existing extensions class |
| `/extensions` | DELETE | Remove an extensions file |

### Details

**GET `/extensions`**
- Response: List of extension metadata (entity name, file path, method names and signatures).

**PUT `/extensions`**
- Request: `{ "entityName": "Account" }`
- Behavior: Scaffolds a new partial class file using the format above.

**POST `/extensions`**
- Request: `{ "entityName": "Account", "methods": [...] }`
- Behavior: Parses the existing file with Roslyn, adds/modifies extension methods.

**DELETE `/extensions`**
- Request: `{ "entityName": "Account" }`
- Behavior: Deletes the `DataExtensions.Account.cs` file.
- Errors: `404` if file doesn't exist.

---

## Summary — All Features

| # | Feature | Status |
|---|---|---|
| 1 | Core infrastructure (.NET 10 Minimal API, DI, folder structure) | Defined |
| 2 | API Key middleware (single key, all routes) | Defined |
| 3 | Error model (standard HTTP status codes) | Defined |
| 4 | Git service (CLI via CliWrap) | Defined |
| 5 | Test runner (`dotnet test` via CLI, TRX parsing) | Defined |
| 6 | File management (Scriban for scaffolding, Roslyn for modification) | Defined |
| 7 | DSL compiler service (JSON → C# via Roslyn) | Placeholder — awaiting DSL spec |
| 8 | Git controller (5 endpoints) | Defined |
| 9 | Metadata controller (1 endpoint) | Defined |
| 10 | Test controller (6 endpoints) | Defined |
| 11 | Data producer controller (3 endpoints) | Defined |
| 12 | Data extensions controller (4 endpoints) | Defined |