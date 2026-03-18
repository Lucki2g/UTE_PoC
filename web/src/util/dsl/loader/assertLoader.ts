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
                    value:    item.right ?? { type: "string" as const, value: "" },
                }))
                : [{
                    column:   r.where.left?.path?.[0] ?? "",
                    operator: r.where.op,
                    value:    r.where.right ?? { type: "string" as const, value: "" },
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

    // Build set of list variable names from retrievals (for legacy path normalisation)
    const listVars = new Set(
        assert.retrievals
            .filter((r) => r.kind === "retrieveList" || r.kind === "retrieveMultiple")
            .map((r) => r.var),
    );

    // Assertion nodes
    for (let i = 0; i < assert.assertions.length; i++) {
        const a      = assert.assertions[i];
        const nodeId = `assert_${i}_${Date.now()}`;

        const rawPath = a.target.path ?? [];
        const isFirst = rawPath[0] === "First";

        // Legacy normalisation: a member path on a list variable that doesn't start with
        // "Count" or "First" was stored before the First-encoding feature existed.
        // Treat it as a First() path so the UI can represent it correctly.
        const targetRootVar = a.target.name ?? a.target.rootVar;
        const isLegacyListMember =
            a.target.kind === "member" &&
            !!targetRootVar &&
            listVars.has(targetRootVar) &&
            rawPath.length > 0 &&
            rawPath[0] !== "First" &&
            rawPath[0] !== "Count";

        const assertData: AssertNodeData = {
            nodeType:      "assert",
            assertionKind: a.kind,
            targetVar:     targetRootVar,
            targetPath:    (isFirst || isLegacyListMember) ? ["First"] : rawPath,
            ...(isFirst && rawPath[1] ? { firstColumn: rawPath[1] } : {}),
            ...(isFirst && rawPath[2] ? { firstSubProp: rawPath[2] } : {}),
            ...(isLegacyListMember && rawPath[0] ? { firstColumn: rawPath[0] } : {}),
            ...(isLegacyListMember && rawPath[1] ? { firstSubProp: rawPath[1] } : {}),
            expectedDsl:   a.expected ?? undefined,
            ...(a.kind === "throw" ? {
                exceptionType: a.exceptionType,
                withMessage:   a.withMessage,
            } : {}),
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
