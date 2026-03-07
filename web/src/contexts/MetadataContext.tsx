import { createContext, useContext, useReducer, type ReactNode } from "react";

// ─── State ───────────────────────────────────────────────────────────────────

export type SyncPhase = "xrmContext" | "metadata" | "workflows" | null;
export type SyncStatus = "started" | "complete" | "error";

export interface SyncProgressEvent {
    phase: SyncPhase;
    status: SyncStatus;
    message: string;
    detail?: string;
    done?: boolean;
}

interface MetadataState {
    syncing: boolean;
    syncPhase: SyncPhase;
    syncMessage: string | null;
    syncError: string | null;
    lastSynced: string | null;
    error: string | null;
}

const initialState: MetadataState = {
    syncing: false,
    syncPhase: null,
    syncMessage: null,
    syncError: null,
    lastSynced: null,
    error: null,
};

// ─── Actions ─────────────────────────────────────────────────────────────────

type MetadataAction =
    | { type: "SYNCING" }
    | { type: "SYNC_PROGRESS"; payload: SyncProgressEvent }
    | { type: "SYNC_COMPLETE" }
    | { type: "SET_ERROR"; payload: string }
    | { type: "CLEAR_ERROR" };

function metadataReducer(state: MetadataState, action: MetadataAction): MetadataState {
    switch (action.type) {
        case "SYNCING":
            return { ...state, syncing: true, syncPhase: null, syncMessage: null, syncError: null, error: null };
        case "SYNC_PROGRESS": {
            const { phase, status, message, detail } = action.payload;
            if (status === "error") {
                return { ...state, syncPhase: phase, syncMessage: message, syncError: detail ?? message };
            }
            return { ...state, syncPhase: phase, syncMessage: message, syncError: null };
        }
        case "SYNC_COMPLETE":
            return {
                ...state,
                syncing: false,
                syncError: null,
                lastSynced: new Date().toISOString(),
                error: null,
            };
        case "SET_ERROR":
            return { ...state, syncing: false, syncMessage: null, error: action.payload };
        case "CLEAR_ERROR":
            return { ...state, error: null, syncError: null };
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
