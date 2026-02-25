import type { BuilderNode, ProducerNodeData } from "../../../models/builder.ts";
import type { DslBinding } from "../../../models/dsl.ts";

const NODE_SPACING = 150;
const NODE_X       = 250;

export interface ArrangeLoaderResult {
    nodes: BuilderNode[];
    nextY: number;
}

/** Maps DSL arrange bindings → producer nodes with Y positioning. */
export function loadArrange(bindings: DslBinding[], startY: number): ArrangeLoaderResult {
    const nodes: BuilderNode[] = [];
    let yPos = startY;

    for (const binding of bindings) {
        const callParts  = binding.producer.call.split(".");
        const entityName = callParts.length >= 2 ? callParts[1] : "Unknown";
        const draftId    = callParts.length >= 3 ? callParts[2] : binding.id;
        const isAnon     = binding.id.startsWith("_anon");

        const nodeData: ProducerNodeData = {
            nodeType:      "producer",
            draftId,
            entityName,
            variableName:  binding.var,
            build:         binding.build,
            anonymous:     isAnon,
            withMutations: binding.producer.with,
        };

        nodes.push({
            id:       binding.id,
            type:     "producer",
            position: { x: NODE_X, y: yPos },
            data:     nodeData,
        });
        yPos += NODE_SPACING;
    }

    return { nodes, nextY: yPos };
}
