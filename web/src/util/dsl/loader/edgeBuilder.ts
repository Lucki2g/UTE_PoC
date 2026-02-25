import type { BuilderEdge } from "../../../models/builder.ts";

export interface EdgeBuildInput {
    producerIds:      string[];
    actNodeId:        string;
    retrievalNodeIds: string[];
    assertionNodeIds: string[];
}

/**
 * Builds all diagram edges:
 *   - producer chain: each producer → next producer
 *   - last producer → act node
 *   - act node → each retrieval node
 *   - last service node (act or last retrieval) → each assert node
 */
export function buildEdges(input: EdgeBuildInput): BuilderEdge[] {
    const { producerIds, actNodeId, retrievalNodeIds, assertionNodeIds } = input;
    const edges: BuilderEdge[] = [];

    // Producer chain
    for (let i = 1; i < producerIds.length; i++) {
        edges.push({
            id:     `e_${producerIds[i - 1]}_${producerIds[i]}`,
            source: producerIds[i - 1],
            target: producerIds[i],
        });
    }

    // Last producer → act
    if (producerIds.length > 0) {
        edges.push({
            id:     `e_${producerIds[producerIds.length - 1]}_${actNodeId}`,
            source: producerIds[producerIds.length - 1],
            target: actNodeId,
        });
    }

    // Act → each retrieval node
    for (const retId of retrievalNodeIds) {
        edges.push({
            id:     `e_${actNodeId}_${retId}`,
            source: actNodeId,
            target: retId,
        });
    }

    // Last service node (last retrieval if any, otherwise act) → each assert
    const lastServiceId = retrievalNodeIds.length > 0
        ? retrievalNodeIds[retrievalNodeIds.length - 1]
        : actNodeId;

    for (const assertId of assertionNodeIds) {
        edges.push({
            id:     `e_${lastServiceId}_${assertId}`,
            source: lastServiceId,
            target: assertId,
        });
    }

    return edges;
}
