import type { BuilderNode, ServiceNodeData, AssertNodeData } from "../../../models/builder.ts";
import type { DslRetrieval, DslAssertion, DslAssertionTarget } from "../../../models/dsl.ts";

// ─── Retrievals ───────────────────────────────────────────────────────────────

/** Maps retrieve service nodes → DSL assert retrievals. */
export function generateRetrievals(retrieveServiceNodes: BuilderNode[]): DslRetrieval[] {
    return retrieveServiceNodes.map((node) => {
        const d    = node.data as ServiceNodeData;
        const kind = d.operation === "RetrieveList" ? "retrieveList" : "retrieveFirstOrDefault";
        const logicOp = d.whereLogicOp ?? "and";
        return {
            var:       d.resultVar ?? "result",
            kind,
            entitySet: d.entitySet ?? "",
            alias:     "x",
            where: d.whereExpressions.length > 0
                ? {
                    op: d.whereExpressions.length > 1 ? logicOp : d.whereExpressions[0].operator,
                    ...(d.whereExpressions.length === 1
                        ? {
                            left:  { kind: "member", root: "x", path: [d.whereExpressions[0].column] },
                            right: d.whereExpressions[0].value,
                        }
                        : {
                            items: d.whereExpressions.map((w) => ({
                                op:    w.operator,
                                left:  { kind: "member", root: "x", path: [w.column] },
                                right: w.value,
                            })),
                        }),
                }
                : null,
        };
    });
}

// ─── Assertions ───────────────────────────────────────────────────────────────

/** Maps assert nodes → DSL assertions. */
export function generateAssertions(asserts: BuilderNode[]): DslAssertion[] {
    return asserts.map((node) => {
        const d       = node.data as AssertNodeData;
        const hasPath = d.targetPath && d.targetPath.length > 0;
        const target: DslAssertionTarget = hasPath
            ? { kind: "member", rootVar: d.targetVar ?? "result", path: d.targetPath! }
            : { kind: "var", name: d.targetVar ?? "result" };

        const assertion: DslAssertion = { kind: d.assertionKind, target };
        if (d.assertionKind === "throw") {
            if (d.exceptionType) assertion.exceptionType = d.exceptionType;
            if (d.withMessage)   assertion.withMessage   = d.withMessage;
        } else if (d.expectedDsl != null) {
            assertion.expected = d.expectedDsl;
        }
        return assertion;
    });
}
