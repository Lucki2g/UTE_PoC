import type { BuilderNode } from "../models/builder.ts";
import type { ProducerNodeData, ServiceNodeData, AssertNodeData } from "../models/builder.ts";
import type {
    DslTestDefinition,
    DslBinding,
    DslOperation,
    DslAssertion,
    DslAssertionTarget,
    DslRetrieval,
    DslValueExpression,
} from "../models/dsl.ts";

function getNodeOrder(data: BuilderNode["data"]): number {
    const d = data as ProducerNodeData | ServiceNodeData | AssertNodeData;
    switch (d.nodeType) {
        case "producer": return 0;
        case "service": return 1;
        case "assert": return 2;
    }
}

function sortNodesByOrder(nodes: BuilderNode[]): BuilderNode[] {
    return [...nodes].sort((a, b) => {
        const orderDiff = getNodeOrder(a.data) - getNodeOrder(b.data);
        if (orderDiff !== 0) return orderDiff;
        return a.position.y - b.position.y;
    });
}

function mapOperationKind(op: string): string {
    const map: Record<string, string> = {
        Create: "create",
        Update: "update",
        RetrieveSingle: "retrieveSingle",
        RetrieveList: "retrieveMultiple",
        Delete: "delete",
    };
    return map[op] ?? op.toLowerCase();
}

function parseStringValue(raw: string): DslValueExpression {
    if (raw === "true" || raw === "false") {
        return { type: "boolean", value: raw === "true" };
    }
    if (raw === "null") {
        return { type: "null" };
    }
    const num = Number(raw);
    if (!isNaN(num) && raw.trim() !== "") {
        return { type: "number", value: num };
    }
    return { type: "string", value: raw };
}

export function generateDsl(
    nodes: BuilderNode[],
    testName: string,
): DslTestDefinition {
    const sorted = sortNodesByOrder(nodes);

    const producers = sorted.filter((n) => (n.data as ProducerNodeData | ServiceNodeData | AssertNodeData).nodeType === "producer");
    const services = sorted.filter((n) => (n.data as ProducerNodeData | ServiceNodeData | AssertNodeData).nodeType === "service");
    const asserts = sorted.filter((n) => (n.data as ProducerNodeData | ServiceNodeData | AssertNodeData).nodeType === "assert");

    // Arrange bindings
    let anonIndex = 0;
    const bindings: DslBinding[] = producers.map((node) => {
        const d = node.data as ProducerNodeData;
        const isAnon = d.anonymous;
        const bindingId = isAnon ? `_anon${anonIndex}` : node.id;
        const bindingVar = isAnon ? `_anon${anonIndex}` : d.variableName;
        if (isAnon) anonIndex++;
        return {
            id: bindingId,
            var: bindingVar,
            kind: "producerDraft",
            producer: {
                call: `DataProducer.${d.entityName}.${d.draftId}`,
                with: d.withMutations,
            },
            build: d.build,
        };
    });

    // Split service nodes: first non-retrieve is the Act, retrieve nodes become retrievals
    const actServiceNode = services.find((n) => {
        const d = n.data as ServiceNodeData;
        return d.operation !== "RetrieveList" && d.operation !== "RetrieveSingle";
    }) ?? services[0];
    const retrieveServiceNodes = services.filter((n) => {
        const d = n.data as ServiceNodeData;
        return n !== actServiceNode && (d.operation === "RetrieveList" || d.operation === "RetrieveSingle");
    });

    const svcData = actServiceNode ? actServiceNode.data as ServiceNodeData : null;
    const operation: DslOperation = svcData
        ? {
            kind: mapOperationKind(svcData.operation),
            awaited: false,
            unawaitedVariant: false,
            ...(svcData.targetBinding
                ? { entity: { fromBinding: svcData.targetBinding, member: "Entity" } }
                : {}),
        }
        : { kind: "create", awaited: false, unawaitedVariant: false };

    // Assert retrievals from retrieve service nodes
    const retrievals: DslRetrieval[] = retrieveServiceNodes.map((node) => {
        const d = node.data as ServiceNodeData;
        const kind = d.operation === "RetrieveList" ? "retrieveList" : "retrieveFirstOrDefault";
        return {
            var: d.resultVar ?? "result",
            kind,
            entitySet: d.entitySet ?? "",
            alias: "x",
            where: d.whereExpressions.length > 0
                ? {
                    op: d.whereExpressions.length > 1 ? "and" : d.whereExpressions[0].operator,
                    ...(d.whereExpressions.length === 1
                        ? {
                            left: { kind: "member", root: "x", path: [d.whereExpressions[0].column] },
                            right: parseStringValue(d.whereExpressions[0].value),
                        }
                        : {
                            items: d.whereExpressions.map((w) => ({
                                op: w.operator,
                                left: { kind: "member", root: "x", path: [w.column] },
                                right: parseStringValue(w.value),
                            })),
                        }),
                }
                : null,
        };
    });

    // Assert assertions
    const assertions: DslAssertion[] = asserts.map((node) => {
        const d = node.data as AssertNodeData;
        const target: DslAssertionTarget = d.targetVar
            ? { kind: "variable", name: d.targetVar }
            : { kind: "variable", name: "result" };

        const assertion: DslAssertion = { kind: d.assertionKind, target };
        if (d.expectedValue !== undefined && d.expectedValue !== "") {
            assertion.expected = parseStringValue(d.expectedValue);
        }
        return assertion;
    });

    return {
        dslVersion: "1.2",
        language: "csharp-aaa",
        test: {
            framework: "xunit",
            kind: "test",
            name: testName,
            async: false,
            arrange: { bindings },
            act: {
                resultVar: svcData?.resultVar,
                operation,
            },
            assert: {
                retrievals,
                assertions,
            },
        },
    };
}
