import type { BuilderNode, ProducerNodeData, ServiceNodeData, AssertNodeData } from "../../../models/builder.ts";
import type { DslBinding } from "../../../models/dsl.ts";

// ─── Node ordering ────────────────────────────────────────────────────────────

function getNodeOrder(data: BuilderNode["data"]): number {
    const d = data as ProducerNodeData | ServiceNodeData | AssertNodeData;
    switch (d.nodeType) {
        case "producer": return 0;
        case "service":  return 1;
        case "assert":   return 2;
    }
}

export function sortNodesByOrder(nodes: BuilderNode[]): BuilderNode[] {
    return [...nodes].sort((a, b) => {
        const orderDiff = getNodeOrder(a.data) - getNodeOrder(b.data);
        if (orderDiff !== 0) return orderDiff;
        return a.position.y - b.position.y;
    });
}

// ─── Arrange section ──────────────────────────────────────────────────────────

/** Maps producer nodes → DSL arrange bindings. */
export function generateArrange(producers: BuilderNode[]): DslBinding[] {
    let anonIndex = 0;
    return producers.map((node) => {
        const d = node.data as ProducerNodeData;
        const isAnon    = d.anonymous;
        const bindingId = isAnon ? `_anon${anonIndex}` : node.id;
        const bindingVar = isAnon ? `_anon${anonIndex}` : d.variableName;
        if (isAnon) anonIndex++;
        return {
            id:       bindingId,
            var:      bindingVar,
            kind:     "producerDraft",
            producer: {
                call: `DataProducer.${d.entityName}.${d.draftId}`,
                with:  d.withMutations,
            },
            build: d.build,
        };
    });
}
