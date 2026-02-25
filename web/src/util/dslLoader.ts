import type { DslTestDefinition } from "../models/dsl.ts";
import type { DiagramState } from "../models/builder.ts";
import { loadArrange } from "./dsl/loader/arrangeLoader.ts";
import { loadAct }     from "./dsl/loader/actLoader.ts";
import { loadAssert }  from "./dsl/loader/assertLoader.ts";
import { buildEdges }  from "./dsl/loader/edgeBuilder.ts";

export function loadDslToDiagram(
    dsl: DslTestDefinition,
    className: string,
): DiagramState {
    const arrange = loadArrange(dsl.test.arrange.bindings, 50);
    const act     = loadAct(dsl.test.act, arrange.nextY);
    const assert  = loadAssert(dsl.test.assert, act.nextY);

    const edges = buildEdges({
        producerIds:      arrange.nodes.map((n) => n.id),
        actNodeId:        act.nodeId,
        retrievalNodeIds: assert.retrievalNodes.map((r) => r.nodeId),
        assertionNodeIds: assert.assertionNodes.map((a) => a.nodeId),
    });

    return {
        nodes: [
            ...arrange.nodes,
            act.node,
            ...assert.retrievalNodes.map((r) => r.node),
            ...assert.assertionNodes.map((a) => a.node),
        ],
        edges,
        testName:      dsl.test.name,
        testClassName: className,
        folderName:    null,
        dirty:         false,
        isNew:         false,
    };
}
