import { createContext, useContext, useReducer, type ReactNode } from "react";
import type { BuilderNode, BuilderEdge, DiagramState } from "../models/builder.ts";
import { emptyDiagram } from "../models/builder.ts";

// ─── Actions ─────────────────────────────────────────────────────────────────

type BuilderAction =
    | { type: "SET_DIAGRAM"; payload: DiagramState }
    | { type: "SET_NODES"; payload: BuilderNode[] }
    | { type: "SET_EDGES"; payload: BuilderEdge[] }
    | { type: "ADD_NODE"; payload: BuilderNode }
    | { type: "UPDATE_NODE"; payload: { id: string; data: Record<string, unknown> } }
    | { type: "REMOVE_NODE"; payload: string }
    | { type: "MARK_CLEAN" }
    | { type: "CLEAR" };

function builderReducer(state: DiagramState, action: BuilderAction): DiagramState {
    switch (action.type) {
        case "SET_DIAGRAM":
            return action.payload;
        case "SET_NODES":
            return { ...state, nodes: action.payload, dirty: true };
        case "SET_EDGES":
            return { ...state, edges: action.payload, dirty: true };
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
