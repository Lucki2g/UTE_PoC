import { createContext, useContext, useReducer, type ReactNode } from "react";
import type { ProducerMetadata } from "../models/responses.ts";

// ─── State ───────────────────────────────────────────────────────────────────

interface ProducerState {
    producers: ProducerMetadata[];
    loading: boolean;
    error: string | null;
}

const initialState: ProducerState = {
    producers: [],
    loading: false,
    error: null,
};

// ─── Actions ─────────────────────────────────────────────────────────────────

type ProducerAction =
    | { type: "LOADING" }
    | { type: "SET_PRODUCERS"; payload: ProducerMetadata[] }
    | { type: "SET_ERROR"; payload: string }
    | { type: "CLEAR_ERROR" };

function producerReducer(state: ProducerState, action: ProducerAction): ProducerState {
    switch (action.type) {
        case "LOADING":
            return { ...state, loading: true, error: null };
        case "SET_PRODUCERS":
            return { ...state, loading: false, producers: action.payload, error: null };
        case "SET_ERROR":
            return { ...state, loading: false, error: action.payload };
        case "CLEAR_ERROR":
            return { ...state, error: null };
    }
}

// ─── Context ─────────────────────────────────────────────────────────────────

interface ProducerContextValue {
    state: ProducerState;
    dispatch: React.Dispatch<ProducerAction>;
}

const ProducerContext = createContext<ProducerContextValue | null>(null);

export function ProducerProvider({ children }: { children: ReactNode }) {
    const [state, dispatch] = useReducer(producerReducer, initialState);
    return (
        <ProducerContext.Provider value={{ state, dispatch }}>
            {children}
        </ProducerContext.Provider>
    );
}

export function useProducerContext(): ProducerContextValue {
    const ctx = useContext(ProducerContext);
    if (!ctx) throw new Error("useProducerContext must be used within ProducerProvider");
    return ctx;
}

export type { ProducerState, ProducerAction };
