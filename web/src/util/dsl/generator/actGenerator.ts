import type { BuilderNode, ServiceNodeData } from "../../../models/builder.ts";
import type { DslOperation } from "../../../models/dsl.ts";
import { mapOperationKind } from "../shared/operationKinds.ts";

/** Maps the act service node → a DSL operation. */
export function generateAct(actServiceNode: BuilderNode | null): DslOperation {
    if (!actServiceNode) {
        return { kind: "create", awaited: false, unawaitedVariant: false };
    }
    const d = actServiceNode.data as ServiceNodeData;
    const mutations = d.withMutations?.map((m) => ({
        targetVar: d.targetBinding ?? "",
        path:      m.path,
        value:     m.value,
    }));

    return {
        kind:             mapOperationKind(d.operation),
        awaited:          false,
        unawaitedVariant: false,
        ...(d.targetBinding
            ? { entity: { fromBinding: d.targetBinding, member: "Entity" } }
            : {}),
        ...(mutations?.length ? { mutations } : {}),
    };
}
