import type { Node, Edge } from "@xyflow/react";
import type { DslWithMutation, DslValueExpression } from "./dsl.ts";

// ─── Node data types ─────────────────────────────────────────────────────────

export interface ProducerNodeData {
    nodeType: "producer";
    draftId: string;
    entityName: string;
    variableName: string;
    build: boolean;
    anonymous: boolean;
    inactivate: boolean;
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
    /** Logical operator combining multiple where entries: "and" | "or" */
    whereLogicOp?: "and" | "or";
    /** When true, the operation is wrapped in a delegate for throws assertions */
    isDelegateAct?: boolean;
    /** Variable name for the delegate (e.g. "action") */
    delegateVar?: string;
    /** Pre-mutations on the target entity before the operation (Update only) */
    withMutations?: DslWithMutation[];
    [key: string]: unknown;
}

export interface AssertNodeData {
    nodeType: "assert";
    assertionKind: string;
    targetVar?: string;
    targetPath?: string[];
    /** Full DSL value expression for the expected value (enum, ref, string, number…) */
    expectedDsl?: DslValueExpression;
    /** For "throw" assertions: the exception type (e.g. "InvalidPluginExecutionException") */
    exceptionType?: string;
    /** For "throw" assertions: expected message passed to .WithMessage(...) */
    withMessage?: string;
    [key: string]: unknown;
}

export interface WhereEntry {
    column: string;
    operator: string;
    value: DslValueExpression;
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
    folderName: string | null;
    dirty: boolean;
    /** True when the test has not yet been persisted to the backend. */
    isNew: boolean;
}

export const emptyDiagram: DiagramState = {
    nodes: [],
    edges: [],
    testName: null,
    testClassName: null,
    folderName: null,
    dirty: false,
    isNew: false,
};
