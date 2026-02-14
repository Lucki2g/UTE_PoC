# TestEngine WEB - Feature Definition

## 1. Vision & Purpose

### 1.1 Product Vision

TestEngine WEB is a React + TypeScript frontend application that
provides a **low-code test authoring experience** for a shared testing
platform built on top of:

-   Dataverse
-   Power Platform (low-code)
-   .NET / XrmMockup (pro-code)

It enables low-code and pro-code developers to collaborate within the
same repository, test runner, and CI/CD pipeline.

------------------------------------------------------------------------

### 1.2 Problem Statement

Organizations using both Power Platform (low-code) and traditional .NET
development (pro-code) face fragmented testing approaches:

-   Pro-code developers write C# unit tests using XrmMockup.
-   Low-code developers lack structured, version-controlled testing
    tools.
-   There is no unified way to author, run, and manage tests across both
    domains.

------------------------------------------------------------------------

### 1.3 Solution Overview

TestEngine WEB:

-   Provides a visual drag-and-drop DSL builder for tests.
-   Communicates with the TestEngine API.
-   Generates structured JSON DSL definitions.
-   Enables execution of both low-code-authored and pro-code tests.
-   Integrates Git operations for safe contribution workflows.

The frontend does **not** generate C# --- it generates DSL JSON consumed
by the API.

------------------------------------------------------------------------

## 2. Technical Foundation

  Concern                Decision
  ---------------------- ---------------------------
  Framework              React + TypeScript + Vite
  Diagram Engine         React Flow
  UI Library             Fluent UI
  Linting                ESLint
  State Management       Context + Reducers
  Architecture Pattern   Unidirectional data flow
  API Auth               X-Api-Key header
  Communication          REST over HTTPS

------------------------------------------------------------------------

## 3. High-Level Architecture

### 3.1 Data Flow

Component → Context → Service → API → Service → Context → Component

-   Components never call the API directly.
-   Services contain HTTP logic.
-   Contexts contain reducers and state transitions.
-   Models contain request/response/DSL types.

------------------------------------------------------------------------

### 3.2 Folder Structure

    web/
    ├── public/
    ├── src/
    │   ├── assets/
    │   ├── components/
    │   ├── contexts/
    │   ├── hooks/
    │   ├── models/
    │   ├── services/
    │   ├── util/
    │   └── main.tsx
    ├── index.html
    ├── package.json
    ├── vite.config.ts
    ├── eslint.config.js
    └── tsconfig.json

------------------------------------------------------------------------

## 4. Authentication

The frontend must:

-   Read an API key from configuration (e.g., environment variable).
-   Include `X-Api-Key` header on all requests.
-   Gracefully handle:
    -   401 Unauthorized
    -   403 Forbidden
    -   409 Conflict
    -   422 Unprocessable Entity
    -   500 Internal Server Error

Unauthorized state should redirect to an error screen or show a blocking
dialog.

------------------------------------------------------------------------

## 5. Layout & UX Structure

The application is divided into:

-   Global Header
-   Left Pane --- Test Explorer
-   Center Pane --- Visual Test Builder
-   Right Pane --- Component Explorer

------------------------------------------------------------------------

## 6. Global Header

Contains:

-   TestEngine name + icon
-   Repository status indicator (branch + clean/dirty)
-   Optional metadata sync indicator

Future extension: - Current branch selector - Git status badge

------------------------------------------------------------------------

## 7. Test Explorer (Left Pane)

### Purpose

Displays test hierarchy and test execution results.

### Structure

-   Collapsible tree view:
    -   Namespace
    -   Class
    -   Test Method

Format example:

    Tests.Accounts.AccountValidationTests.Should_Create_Valid_Account

### Features

-   Right-click context menu:
    -   Run test
    -   Open test
    -   Delete test
-   Top header:
    -   Run All button
    -   Search/filter input

### Test Result Indicators

  State     UI
  --------- ----------------
  Passed    Green check
  Failed    Red X
  Skipped   Yellow warning

### TestRunResult Model

    {
      testName?: string;
      passed: boolean;
      duration: string;
      trace?: string;
      errorMessage?: string;
    }

Expanding a failed test should show:

-   Error message
-   Stack trace

------------------------------------------------------------------------

## 8. Component Explorer (Right Pane)

### Purpose

Contains draggable DSL building blocks.

### Tabs

-   DataProducers
-   DataExtensions
-   LINQ
-   Assert

Switching tabs swaps available components.

------------------------------------------------------------------------

### 8.1 DataProducers Tab

Displays producers retrieved from `/producers`.

Draggable node type: - Draft`<Entity>`{=html}

------------------------------------------------------------------------

### 8.2 DataExtensions Tab

Contains:

-   With block
-   Build toggle block
-   Custom extension methods from `/extensions`

------------------------------------------------------------------------

### 8.3 LINQ Tab

Initial version supports:

-   Where expression

------------------------------------------------------------------------

### 8.4 Assert Tab

FluentAssertion blocks:

-   NotNull
-   ShouldBe
-   Throws
-   ContainSingle

Each block maps to DSL assertion instructions.

------------------------------------------------------------------------

## 9. Center Pane --- Visual Test Builder

### Diagram Engine

Uses React Flow.

### Interaction

-   Pan
-   Zoom
-   Nodes placed in single vertical column
-   Strict ordering rules

------------------------------------------------------------------------

## 10. Node Types

### 10.1 DataProducer Node

-   Icon: dataproducer-icon.svg
-   Editable element name
-   Accepts:
    -   With blocks
    -   Build toggle (default false)

Dynamic field handling based on metadata:

  Column Type   UI Control
  ------------- ------------------------------
  Text          Text input
  Number        Numeric input
  Enum/Choice   Dropdown
  Lookup        Dropdown of previous outputs

------------------------------------------------------------------------

### 10.2 DataverseService Node

Operations:

-   Create
-   Update
-   RetrieveSingle
-   RetrieveList
-   Delete

RetrieveList accepts LINQ blocks.

------------------------------------------------------------------------

### 10.3 Assert Node

-   Icon: assert-icon.svg
-   Accepts assertion blocks
-   Always terminal node

------------------------------------------------------------------------

## 11. Node Ordering Rules

Enforced logical flow:

1.  DataProducer (Arrange)
2.  DataverseService (Act)
3.  Assert (Assert)

UI must prevent invalid graph structures.

------------------------------------------------------------------------

## 12. State Management

### Contexts

-   TestContext
-   GitContext
-   MetadataContext
-   ProducerContext
-   ExtensionContext

Each contains:

-   State
-   Reducer
-   Action types

------------------------------------------------------------------------

## 13. Loading & Async States

Must support:

-   Metadata sync spinner
-   Test execution progress
-   Git operations loading state

All async calls must:

-   Set loading state
-   Handle success
-   Handle error

------------------------------------------------------------------------

## 14. Error Handling Strategy

Global error handler:

-   Snackbar for recoverable errors
-   Modal for destructive failures
-   Full-screen error fallback for fatal state

------------------------------------------------------------------------

## 15. Non-Functional Requirements

-   Type-safe models for all API contracts
-   Strict ESLint configuration
-   No any types
-   Responsive layout (minimum width defined)
-   Accessible keyboard navigation
-   Deterministic state updates (pure reducers)

------------------------------------------------------------------------

## 16. Future Enhancements

-   Visual diff viewer for Git changes
-   Live test streaming
-   DSL validation before save
-   Drag-to-reorder services/asserts
-   Visual branch management
-   Role-based UI restrictions

------------------------------------------------------------------------

# End of Document
