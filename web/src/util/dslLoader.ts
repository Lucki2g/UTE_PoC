import type { DslTestDefinition } from "../models/dsl.ts";
import type {
    BuilderNode,
    BuilderEdge,
    DiagramState,
    ProducerNodeData,
    ServiceNodeData,
    AssertNodeData,
} from "../models/builder.ts";

const NODE_SPACING = 150;
const NODE_X = 250;

function mapOperationBack(kind: string): ServiceNodeData["operation"] {
    const map: Record<string, ServiceNodeData["operation"]> = {
        create: "Create",
        update: "Update",
        retrieveSingle: "RetrieveSingle",
        retrieveMultiple: "RetrieveList",
        delete: "Delete",
    };
    return map[kind] ?? "Create";
}

export function loadDslToDiagram(
    dsl: DslTestDefinition,
    className: string,
): DiagramState {
    const nodes: BuilderNode[] = [];
    const edges: BuilderEdge[] = [];
    let yPos = 50;

    // Arrange → producer nodes
    for (const binding of dsl.test.arrange.bindings) {
        const callParts = binding.producer.call.split(".");
        const entityName = callParts.length >= 2 ? callParts[1] : "Unknown";
        const draftId = callParts.length >= 3 ? callParts[2] : binding.id;

        console.log("producer node:", callParts, dsl);
        const nodeData: ProducerNodeData = {
            nodeType: "producer",
            draftId,
            entityName,
            variableName: binding.var,
            build: binding.build,
            withMutations: binding.producer.with,
        };

        nodes.push({
            id: binding.id,
            type: "producer",
            position: { x: NODE_X, y: yPos },
            data: nodeData,
        });
        yPos += NODE_SPACING;
    }

    // Act → service node
    const act = dsl.test.act;
    const svcId = `svc_${Date.now()}`;
    const svcData: ServiceNodeData = {
        nodeType: "service",
        operation: mapOperationBack(act.operation.kind),
        targetBinding: act.operation.entity?.fromBinding,
        resultVar: act.resultVar,
        whereExpressions: [],
    };

    nodes.push({
        id: svcId,
        type: "service",
        position: { x: NODE_X, y: yPos },
        data: svcData,
    });

    // Edge from last producer to service
    if (nodes.length > 1) {
        const lastProducer = nodes[nodes.length - 2];
        edges.push({
            id: `e_${lastProducer.id}_${svcId}`,
            source: lastProducer.id,
            target: svcId,
        });
    }

    yPos += NODE_SPACING;

    // Assert → assert nodes
    for (let i = 0; i < dsl.test.assert.assertions.length; i++) {
        const a = dsl.test.assert.assertions[i];
        const assertId = `assert_${i}_${Date.now()}`;
        const assertData: AssertNodeData = {
            nodeType: "assert",
            assertionKind: a.kind,
            targetVar: a.target.name ?? a.target.rootVar,
            expectedValue: a.expected && "value" in a.expected ? String(a.expected.value) : undefined,
        };

        nodes.push({
            id: assertId,
            type: "assert",
            position: { x: NODE_X, y: yPos },
            data: assertData,
        });

        // Edge from service to assert
        edges.push({
            id: `e_${svcId}_${assertId}`,
            source: svcId,
            target: assertId,
        });

        yPos += NODE_SPACING;
    }

    // Connect producer chain
    const producerNodes = nodes.filter((n) => n.type === "producer");
    for (let i = 1; i < producerNodes.length; i++) {
        edges.push({
            id: `e_${producerNodes[i - 1].id}_${producerNodes[i].id}`,
            source: producerNodes[i - 1].id,
            target: producerNodes[i].id,
        });
    }

    return {
        nodes,
        edges,
        testName: dsl.test.name,
        testClassName: className,
        dirty: false,
    };
}
