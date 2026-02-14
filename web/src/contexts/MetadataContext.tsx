import { createContext, useContext, useReducer, type ReactNode } from "react";

// ─── State ───────────────────────────────────────────────────────────────────

interface MetadataState {
    syncing: boolean;
    lastSynced: string | null;
    error: string | null;
}

const initialState: MetadataState = {
    syncing: false,
    lastSynced: null,
    error: null,
};

// ─── Actions ─────────────────────────────────────────────────────────────────

type MetadataAction =
    | { type: "SYNCING" }
    | { type: "SYNC_COMPLETE" }
    | { type: "SET_ERROR"; payload: string }
    | { type: "CLEAR_ERROR" };

function metadataReducer(state: MetadataState, action: MetadataAction): MetadataState {
    switch (action.type) {
        case "SYNCING":
            return { ...state, syncing: true, error: null };
        case "SYNC_COMPLETE":
            return { ...state, syncing: false, lastSynced: new Date().toISOString(), error: null };
        case "SET_ERROR":
            return { ...state, syncing: false, error: action.payload };
        case "CLEAR_ERROR":
            return { ...state, error: null };
    }
}

// ─── Context ─────────────────────────────────────────────────────────────────

interface MetadataContextValue {
    state: MetadataState;
    dispatch: React.Dispatch<MetadataAction>;
}

const MetadataContext = createContext<MetadataContextValue | null>(null);

export function MetadataProvider({ children }: { children: ReactNode }) {
    const [state, dispatch] = useReducer(metadataReducer, initialState);
    return (
        <MetadataContext.Provider value={{ state, dispatch }}>
            {children}
        </MetadataContext.Provider>
    );
}

export function useMetadataContext(): MetadataContextValue {
    const ctx = useContext(MetadataContext);
    if (!ctx) throw new Error("useMetadataContext must be used within MetadataProvider");
    return ctx;
}

export type { MetadataState, MetadataAction };
