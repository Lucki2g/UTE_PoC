import { createContext, useContext, useReducer, type ReactNode } from "react";
import type { BuilderNode, BuilderEdge, DiagramState } from "../models/builder.ts";
import { emptyDiagram } from "../models/builder.ts";

// ─── Actions ─────────────────────────────────────────────────────────────────

type BuilderAction =
    | { type: "SET_DIAGRAM"; payload: DiagramState }
    | { type: "SET_NODES"; payload: BuilderNode[] }
    | { type: "SET_EDGES"; payload: BuilderEdge[] }
    | { type: "SET_NODES_AND_EDGES"; payload: { nodes: BuilderNode[]; edges: BuilderEdge[] } }
    | { type: "ADD_NODE"; payload: BuilderNode }
    | { type: "UPDATE_NODE"; payload: { id: string; data: Record<string, unknown> } }
    | { type: "REMOVE_NODE"; payload: string }
    | { type: "MARK_CLEAN" }
    | { type: "MARK_PERSISTED"; payload: string }
    | { type: "CLEAR" };

function builderReducer(state: DiagramState, action: BuilderAction): DiagramState {
    switch (action.type) {
        case "SET_DIAGRAM":
            return action.payload;
        case "SET_NODES":
            return { ...state, nodes: action.payload };
        case "SET_EDGES":
            return { ...state, edges: action.payload };
        case "SET_NODES_AND_EDGES":
            return { ...state, nodes: action.payload.nodes, edges: action.payload.edges, dirty: true };
        case "ADD_NODE":
            return { ...state, nodes: [...state.nodes, action.payload], dirty: true };
        case "UPDATE_NODE":
            return {
                ...state,
                dirty: true,
                nodes: state.nodes.map((n) =>
                    n.id === action.payload.id
                        ? { ...n, data: { ...n.data, ...action.payload.data } as BuilderNode["data"] }
                        : n,
                ),
            };
        case "REMOVE_NODE":
            return {
                ...state,
                dirty: true,
                nodes: state.nodes.filter((n) => n.id !== action.payload),
                edges: state.edges.filter(
                    (e) => e.source !== action.payload && e.target !== action.payload,
                ),
            };
        case "MARK_CLEAN":
            return { ...state, dirty: false };
        case "MARK_PERSISTED":
            return { ...state, isNew: false, testClassName: action.payload };
        case "CLEAR":
            return emptyDiagram;
    }
}

// ─── Context ─────────────────────────────────────────────────────────────────

interface BuilderContextValue {
    state: DiagramState;
    dispatch: React.Dispatch<BuilderAction>;
}

const BuilderContext = createContext<BuilderContextValue | null>(null);

export function BuilderProvider({ children }: { children: ReactNode }) {
    const [state, dispatch] = useReducer(builderReducer, emptyDiagram);
    return (
        <BuilderContext.Provider value={{ state, dispatch }}>
            {children}
        </BuilderContext.Provider>
    );
}

export function useBuilderContext(): BuilderContextValue {
    const ctx = useContext(BuilderContext);
    if (!ctx) throw new Error("useBuilderContext must be used within BuilderProvider");
    return ctx;
}

export type { BuilderAction };
