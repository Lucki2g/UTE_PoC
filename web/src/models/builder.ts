import type { Node, Edge } from "@xyflow/react";
import type { DslWithMutation } from "./dsl.ts";

// ─── Node data types ─────────────────────────────────────────────────────────

export interface ProducerNodeData {
    nodeType: "producer";
    draftId: string;
    entityName: string;
    variableName: string;
    build: boolean;
    anonymous: boolean;
    withMutations: DslWithMutation[];
    [key: string]: unknown;
}

export interface ServiceNodeData {
    nodeType: "service";
    operation: "Create" | "Update" | "RetrieveSingle" | "RetrieveList" | "Delete";
    targetBinding?: string;
    resultVar?: string;
    entitySet?: string;
    whereExpressions: WhereEntry[];
    [key: string]: unknown;
}

export interface AssertNodeData {
    nodeType: "assert";
    assertionKind: string;
    targetVar?: string;
    expectedValue?: string;
    [key: string]: unknown;
}

export interface WhereEntry {
    column: string;
    operator: string;
    value: string;
}

export type BuilderNodeData = ProducerNodeData | ServiceNodeData | AssertNodeData;
export type BuilderNode = Node<BuilderNodeData>;
export type BuilderEdge = Edge;

// ─── Diagram state ──────────────────────────────────────────────────────────

export interface DiagramState {
    nodes: BuilderNode[];
    edges: BuilderEdge[];
    testName: string | null;
    testClassName: string | null;
    dirty: boolean;
}

export const emptyDiagram: DiagramState = {
    nodes: [],
    edges: [],
    testName: null,
    testClassName: null,
    dirty: false,
};
