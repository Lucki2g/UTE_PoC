import type { BuilderNode, ServiceNodeData } from "../../../models/builder.ts";
import type { DslAct } from "../../../models/dsl.ts";
import { mapOperationBack } from "../shared/operationKinds.ts";

const NODE_SPACING = 150;
const NODE_X       = 250;

export interface ActLoaderResult {
    node:   BuilderNode;
    nodeId: string;
    nextY:  number;
}

/** Maps a DSL act section → a single service node. */
export function loadAct(act: DslAct, startY: number): ActLoaderResult {
    const nodeId  = `svc_${Date.now()}`;
    const svcData: ServiceNodeData = {
        nodeType:        "service",
        operation:       mapOperationBack(act.operation.kind),
        targetBinding:   act.operation.entity?.fromBinding,
        resultVar:       act.resultVar,
        whereExpressions: [],
    };

    const node: BuilderNode = {
        id:       nodeId,
        type:     "service",
        position: { x: NODE_X, y: startY },
        data:     svcData,
    };

    return { node, nodeId, nextY: startY + NODE_SPACING };
}
