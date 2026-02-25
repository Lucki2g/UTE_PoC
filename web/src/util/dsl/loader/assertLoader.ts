import type { BuilderNode, ServiceNodeData, AssertNodeData } from "../../../models/builder.ts";
import type { DslAssert } from "../../../models/dsl.ts";

const NODE_SPACING = 150;
const NODE_X       = 250;

export interface AssertLoaderResult {
    retrievalNodes: Array<{ node: BuilderNode; nodeId: string }>;
    assertionNodes: Array<{ node: BuilderNode; nodeId: string }>;
    nextY: number;
}

/** Maps DSL assert section → retrieval service nodes + assertion nodes. */
export function loadAssert(assert: DslAssert, startY: number): AssertLoaderResult {
    const retrievalNodes: Array<{ node: BuilderNode; nodeId: string }> = [];
    const assertionNodes: Array<{ node: BuilderNode; nodeId: string }> = [];
    let yPos = startY;

    // Retrieval nodes
    for (let i = 0; i < assert.retrievals.length; i++) {
        const r         = assert.retrievals[i];
        const nodeId    = `ret_${i}_${Date.now()}`;
        const operation = r.kind === "retrieveList" || r.kind === "retrieveMultiple"
            ? "RetrieveList" as const
            : "RetrieveSingle" as const;

        const whereEntries = r.where
            ? r.where.items
                ? r.where.items.map((item) => ({
                    column:   item.left?.path?.[0] ?? "",
                    operator: item.op,
                    value:    item.right && "value" in item.right ? String(item.right.value) : "",
                }))
                : [{
                    column:   r.where.left?.path?.[0] ?? "",
                    operator: r.where.op,
                    value:    r.where.right && "value" in r.where.right ? String(r.where.right.value) : "",
                }]
            : [];

        const retData: ServiceNodeData = {
            nodeType:         "service",
            operation,
            resultVar:        r.var,
            entitySet:        r.entitySet,
            whereExpressions: whereEntries,
        };

        retrievalNodes.push({
            nodeId,
            node: {
                id:       nodeId,
                type:     "service",
                position: { x: NODE_X, y: yPos },
                data:     retData,
            },
        });
        yPos += NODE_SPACING;
    }

    // Assertion nodes
    for (let i = 0; i < assert.assertions.length; i++) {
        const a      = assert.assertions[i];
        const nodeId = `assert_${i}_${Date.now()}`;

        const assertData: AssertNodeData = {
            nodeType:      "assert",
            assertionKind: a.kind,
            targetVar:     a.target.name ?? a.target.rootVar,
            targetPath:    a.target.path ?? [],
            expectedValue: a.expected && "value" in a.expected ? String(a.expected.value) : undefined,
        };

        assertionNodes.push({
            nodeId,
            node: {
                id:       nodeId,
                type:     "assert",
                position: { x: NODE_X, y: yPos },
                data:     assertData,
            },
        });
        yPos += NODE_SPACING;
    }

    return { retrievalNodes, assertionNodes, nextY: yPos };
}
