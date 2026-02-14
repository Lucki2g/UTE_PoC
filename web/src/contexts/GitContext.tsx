import { createContext, useContext, useReducer, type ReactNode } from "react";
import type { RepositoryStatus } from "../models/responses.ts";

// ─── State ───────────────────────────────────────────────────────────────────

interface GitState {
    status: RepositoryStatus | null;
    loading: boolean;
    error: string | null;
}

const initialState: GitState = {
    status: null,
    loading: false,
    error: null,
};

// ─── Actions ─────────────────────────────────────────────────────────────────

type GitAction =
    | { type: "LOADING" }
    | { type: "SET_STATUS"; payload: RepositoryStatus }
    | { type: "SET_ERROR"; payload: string }
    | { type: "CLEAR_ERROR" };

function gitReducer(state: GitState, action: GitAction): GitState {
    switch (action.type) {
        case "LOADING":
            return { ...state, loading: true, error: null };
        case "SET_STATUS":
            return { ...state, loading: false, status: action.payload, error: null };
        case "SET_ERROR":
            return { ...state, loading: false, error: action.payload };
        case "CLEAR_ERROR":
            return { ...state, error: null };
    }
}

// ─── Context ─────────────────────────────────────────────────────────────────

interface GitContextValue {
    state: GitState;
    dispatch: React.Dispatch<GitAction>;
}

const GitContext = createContext<GitContextValue | null>(null);

export function GitProvider({ children }: { children: ReactNode }) {
    const [state, dispatch] = useReducer(gitReducer, initialState);
    return (
        <GitContext.Provider value={{ state, dispatch }}>
            {children}
        </GitContext.Provider>
    );
}

export function useGitContext(): GitContextValue {
    const ctx = useContext(GitContext);
    if (!ctx) throw new Error("useGitContext must be used within GitProvider");
    return ctx;
}

export type { GitState, GitAction };
