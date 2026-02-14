import { createContext, useContext, useReducer, type ReactNode } from "react";
import type { ExtensionMetadata } from "../models/responses.ts";

// ─── State ───────────────────────────────────────────────────────────────────

interface ExtensionState {
    extensions: ExtensionMetadata[];
    loading: boolean;
    error: string | null;
}

const initialState: ExtensionState = {
    extensions: [],
    loading: false,
    error: null,
};

// ─── Actions ─────────────────────────────────────────────────────────────────

type ExtensionAction =
    | { type: "LOADING" }
    | { type: "SET_EXTENSIONS"; payload: ExtensionMetadata[] }
    | { type: "SET_ERROR"; payload: string }
    | { type: "CLEAR_ERROR" };

function extensionReducer(state: ExtensionState, action: ExtensionAction): ExtensionState {
    switch (action.type) {
        case "LOADING":
            return { ...state, loading: true, error: null };
        case "SET_EXTENSIONS":
            return { ...state, loading: false, extensions: action.payload, error: null };
        case "SET_ERROR":
            return { ...state, loading: false, error: action.payload };
        case "CLEAR_ERROR":
            return { ...state, error: null };
    }
}

// ─── Context ─────────────────────────────────────────────────────────────────

interface ExtensionContextValue {
    state: ExtensionState;
    dispatch: React.Dispatch<ExtensionAction>;
}

const ExtensionContext = createContext<ExtensionContextValue | null>(null);

export function ExtensionProvider({ children }: { children: ReactNode }) {
    const [state, dispatch] = useReducer(extensionReducer, initialState);
    return (
        <ExtensionContext.Provider value={{ state, dispatch }}>
            {children}
        </ExtensionContext.Provider>
    );
}

export function useExtensionContext(): ExtensionContextValue {
    const ctx = useContext(ExtensionContext);
    if (!ctx) throw new Error("useExtensionContext must be used within ExtensionProvider");
    return ctx;
}

export type { ExtensionState, ExtensionAction };
