# TestEngine WEB - Feature Definition

## 1. Core Infrastructure & Purpose

### Purpose

The Test Engine WEB is a React/TS/Vite frontend for a Power Platform Code App that serves as the frontend for a **low-code / pro-code shared testing platform** built on top of the Dataverse / Power Platform ecosystem.
It uses React Flow for its diagram building and Fluent UI for its components and styling to keep the Microsoft feel.
Is uses ESLint for keeping best practices.

**The problem it solves:** Create a lowcode option for writing low-code unit tests that integrates with pro-code tests and runs the context of both lowcode Power Automate and procode plugins.

**The solution:** The Frontend uses the TestEngine API that bridges the gap between the lowcode and procode test via share respository, with a nice lowcode drag/drop UI UX.

### Technical Foundation
| Concern | Decision |
|---|---|
|Framework|React/Vite/TypeScript|
|Styling|Fluent UI/React Flow|

### Project Structure

```
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
```

## 2. Authentication
The API expects a `X-Api-Key` header, and compares it against a configured key.

## 3. Design

### Test Explorer
The left sidepane contains the testcases of the project.
Here you can right click to see a menu to run test cases or open the testcase.
The testpane also cotnain results of test runs, the api returns the format:
```
public class TestRunResult
{
    public string? TestName { get; set; }
    public bool Passed { get; set; }
    public required string Duration { get; set; }
    public string? Trace { get; set; }
    public string? ErrorMessage { get; set; }
}

```
Test runs that fail are red with an x and successes are green with a check. Skipped are a yellow warning.
You can fold out the testcases like a hiearchy representing the testtree: Namespace.ClassName.TestFile

At the top of the pane there is a small header with a button to run all tests and search filter for the testcases.

### Component Explorer
The right sidepane contains the elements that can be dragged onto the center pane. At the top there is header with tabs for DataProducers, DataExtensions, LINQ, Assert with icons. Pressing the tabs swaps what is shows in the pane. You can drag and drop comnponents on to the center pane.
DataProducers tab show the dataproducers retrieved from the API.
DataExtensions tab show the With and Build block as well as the ones retrieved from the API.
LINQ tab shows the available LINQ expressions. This is just "Where" for now.
Assert tab shows the available FluentAssertion extensions such as ShouldBe, NotNull, ContainSingle etc.

### Center Pane
The center is for the React Flow diagram that shows the lowcode version of the testcase.
You can pan and zoom on the pane, but nodes are inserted in a fixed spaced single column.

The center pane has a header with buttons on the right to save, publish, and state which calls the API gitcontroller. On the left in the header there is an input for the testcase name. 

#### Nodes
There are 3 types of nodes. All nodes a simple with its icon top-left and name next to it. Some nodes then allow for expanding with additional elements. You can look at /requirements/images/ for inspiration. Nodes are always placed in the order DataProducers > DataverseService <> Assert. DataverseService and Assert can be in mixed order.

**DataProducers** - has the dataproducer-icon.svg icon. The headername is based of the data producer name given from the API e.g. DraftAccount. The dataproducer has an input for the elementname (used as input to other nodes). Below the input for name you can drag drop "With" blocks from the DataExtensions. These With blocks has the fixed text "With X eq Y" where X is a searchable droplist of available columns on the dataproducer's dataverse entity/table. Y is an input whose type is defined by the column type choosen. E.g. for a choice/enum it is a drop down; for numbers it takes numbers; for text a normal textinput; and for entityreferences/lookups it is a dropdown for previous dataproducer's output. Lastly it has a toggle for Build.

**DataverseService** - has the dataverseservice-icon.svg icon. The headername is based on the operation e.g. Create, Update etc. The node acts a little different based on operation. Create, update, retrievesingle, delete has input for inserting dataproducer's output. RetrieveList can take components from the LINQ section in the component explorer. These are LINQ Expression such as Where. The "Where" block takes a Dataverse column an operation and then depending on column type an inputfield like dataproducer's "With".

**Assert** - has the assert-icon.svg icon. The headername is always Assert. The node takes blocks from the Assert tab in the component explorer. The blocks represent FluentAssertion methods such as NotNull, ShouldBe, Throws.

### Header
Above the Explorers and Center pane there is header with the TestEngine name and icon.

## 4. Architecture
State is managed inside reducers in the contexts.

Requests, responses and any data interface/class is located in the models.

### Dataflow
The flow of data should be Component > Context > Service > API > Service > Context > Component.
There is a loading state for certain operation such as running metadatasync as this may take a while for the UI to display the long request.