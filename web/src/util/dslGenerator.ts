import type { BuilderNode, BuilderNodeData, ServiceNodeData } from "../models/builder.ts";
import type { DslTestDefinition } from "../models/dsl.ts";
import { sortNodesByOrder, generateArrange } from "./dsl/generator/arrangeGenerator.ts";
import { generateAct } from "./dsl/generator/actGenerator.ts";
import { generateRetrievals, generateAssertions } from "./dsl/generator/assertGenerator.ts";

function nodeType(node: BuilderNode): BuilderNodeData["nodeType"] {
    return (node.data as BuilderNodeData).nodeType;
}

function isRetrieve(node: BuilderNode): boolean {
    const d = node.data as ServiceNodeData;
    return d.operation === "RetrieveList" || d.operation === "RetrieveSingle";
}

export function generateDsl(
    nodes: BuilderNode[],
    testName: string,
): DslTestDefinition {
    const sorted    = sortNodesByOrder(nodes);
    const producers = sorted.filter((n) => nodeType(n) === "producer");
    const services  = sorted.filter((n) => nodeType(n) === "service");
    const asserts   = sorted.filter((n) => nodeType(n) === "assert");

    const actServiceNode       = services.find((n) => !isRetrieve(n)) ?? null;
    const retrieveServiceNodes = services.filter((n) => n !== actServiceNode && isRetrieve(n));

    const svcData = actServiceNode ? actServiceNode.data as ServiceNodeData : null;

    return {
        dslVersion: "1.2",
        language:   "csharp-aaa",
        test: {
            framework: "xunit",
            kind:      "test",
            name:      testName,
            async:     false,
            arrange: { bindings: generateArrange(producers) },
            act: {
                resultVar: svcData?.resultVar,
                operation: generateAct(actServiceNode),
            },
            assert: {
                retrievals: generateRetrievals(retrieveServiceNodes),
                assertions: generateAssertions(asserts),
            },
        },
    };
}
