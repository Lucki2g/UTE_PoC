import { createContext, useContext, useReducer, type ReactNode } from "react";
import type { TestMetadata, TestRunResult } from "../models/responses.ts";

// ─── State ───────────────────────────────────────────────────────────────────

interface TestState {
    tests: TestMetadata[];
    results: Map<string, TestRunResult>;
    runningTests: Set<string>;
    selectedTest: string | null;
    loading: boolean;
    running: boolean;
    error: string | null;
}

const initialState: TestState = {
    tests: [],
    results: new Map(),
    runningTests: new Set(),
    selectedTest: null,
    loading: false,
    running: false,
    error: null,
};

// ─── Actions ─────────────────────────────────────────────────────────────────

type TestAction =
    | { type: "LOADING" }
    | { type: "RUNNING" }
    | { type: "RUNNING_TEST"; payload: string }
    | { type: "RUNNING_TESTS"; payload: string[] }
    | { type: "SET_TESTS"; payload: TestMetadata[] }
    | { type: "SET_RESULT"; payload: TestRunResult }
    | { type: "SET_ALL_RESULTS"; payload: TestRunResult[] }
    | { type: "SELECT_TEST"; payload: string | null }
    | { type: "SET_ERROR"; payload: string }
    | { type: "CLEAR_ERROR" }
    | { type: "DONE_RUNNING" };

function testReducer(state: TestState, action: TestAction): TestState {
    switch (action.type) {
        case "LOADING":
            return { ...state, loading: true, error: null };
        case "RUNNING":
            return { ...state, running: true, error: null };
        case "RUNNING_TEST": {
            const next = new Set(state.runningTests);
            next.add(action.payload);
            return { ...state, runningTests: next, error: null };
        }
        case "RUNNING_TESTS": {
            const next = new Set(state.runningTests);
            for (const t of action.payload) next.add(t);
            return { ...state, running: true, runningTests: next, error: null };
        }
        case "SET_TESTS":
            return { ...state, loading: false, tests: action.payload, error: null };
        case "SET_RESULT": {
            const next = new Map(state.results);
            const nowRunning = new Set(state.runningTests);
            if (action.payload.testName) {
                next.set(action.payload.testName, action.payload);
                nowRunning.delete(action.payload.testName);
            }
            return { ...state, running: nowRunning.size > 0, runningTests: nowRunning, results: next, error: null };
        }
        case "SET_ALL_RESULTS": {
            const next = new Map(state.results);
            const nowRunning = new Set(state.runningTests);
            for (const r of action.payload) {
                if (r.testName) {
                    next.set(r.testName, r);
                    nowRunning.delete(r.testName);
                }
            }
            return { ...state, running: false, runningTests: nowRunning, results: next, error: null };
        }
        case "SELECT_TEST":
            return { ...state, selectedTest: action.payload };
        case "SET_ERROR":
            return { ...state, loading: false, running: false, runningTests: new Set(), error: action.payload };
        case "CLEAR_ERROR":
            return { ...state, error: null };
        case "DONE_RUNNING":
            return { ...state, running: false, runningTests: new Set() };
    }
}

// ─── Context ─────────────────────────────────────────────────────────────────

interface TestContextValue {
    state: TestState;
    dispatch: React.Dispatch<TestAction>;
}

const TestContext = createContext<TestContextValue | null>(null);

export function TestProvider({ children }: { children: ReactNode }) {
    const [state, dispatch] = useReducer(testReducer, initialState);
    return (
        <TestContext.Provider value={{ state, dispatch }}>
            {children}
        </TestContext.Provider>
    );
}

export function useTestContext(): TestContextValue {
    const ctx = useContext(TestContext);
    if (!ctx) throw new Error("useTestContext must be used within TestProvider");
    return ctx;
}

export type { TestState, TestAction };
