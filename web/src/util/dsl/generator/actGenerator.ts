import type { BuilderNode, ServiceNodeData, ProducerNodeData } from "../../../models/builder.ts";
import type { DslOperation } from "../../../models/dsl.ts";
import { mapOperationKind } from "../shared/operationKinds.ts";

/** Maps the act service node → a DSL operation. */
export function generateAct(actServiceNode: BuilderNode | null, producers: BuilderNode[] = []): DslOperation {
    if (!actServiceNode) {
        return { kind: "create", awaited: false, unawaitedVariant: false };
    }
    const d = actServiceNode.data as ServiceNodeData;

    // Find the entity name for the target binding to enable property name resolution on the backend
    const targetProducer = d.targetBinding
        ? producers.find((p) => (p.data as ProducerNodeData).variableName === d.targetBinding)
        : undefined;
    const entitySet = targetProducer ? (targetProducer.data as ProducerNodeData).entityName : undefined;

    const mutations = d.withMutations?.map((m) => ({
        targetVar: d.targetBinding ?? "",
        path:      m.path,
        value:     m.value,
        ...(entitySet ? { entitySet } : {}),
    }));

    return {
        kind:             mapOperationKind(d.operation),
        awaited:          false,
        unawaitedVariant: false,
        ...(d.targetBinding
            ? { entity: { fromBinding: d.targetBinding, member: "" } }
            : {}),
        ...(mutations?.length ? { mutations } : {}),
    };
}
