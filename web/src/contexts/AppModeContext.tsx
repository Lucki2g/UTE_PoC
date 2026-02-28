import { createContext, useContext, useReducer, type ReactNode } from "react";
import type { DslProducerDefinition } from "../models/dsl.ts";

// ─── State ───────────────────────────────────────────────────────────────────

export type AppMode = "testBuilder" | "producerEditor";

export interface ProducerEditorState {
    entityName: string;
    /** The DSL being edited (null while loading) */
    dsl: DslProducerDefinition | null;
    dirty: boolean;
    isNew: boolean;
    /** When true, the editor should immediately open the "Add Draft" dialog */
    focusNewDraft: boolean;
}

export interface AppModeState {
    mode: AppMode;
    producerEditor: ProducerEditorState | null;
}

const initialState: AppModeState = {
    mode: "testBuilder",
    producerEditor: null,
};

// ─── Actions ─────────────────────────────────────────────────────────────────

type AppModeAction =
    | { type: "OPEN_PRODUCER_EDITOR"; payload: { entityName: string; dsl: DslProducerDefinition | null; isNew: boolean; focusNewDraft?: boolean } }
    | { type: "SET_PRODUCER_DSL"; payload: DslProducerDefinition }
    | { type: "MARK_PRODUCER_DIRTY" }
    | { type: "MARK_PRODUCER_CLEAN" }
    | { type: "CLEAR_FOCUS_NEW_DRAFT" }
    | { type: "CLOSE_PRODUCER_EDITOR" };

function reducer(state: AppModeState, action: AppModeAction): AppModeState {
    switch (action.type) {
        case "OPEN_PRODUCER_EDITOR":
            return {
                mode: "producerEditor",
                producerEditor: {
                    entityName: action.payload.entityName,
                    dsl: action.payload.dsl,
                    dirty: false,
                    isNew: action.payload.isNew,
                    focusNewDraft: action.payload.focusNewDraft ?? false,
                },
            };
        case "SET_PRODUCER_DSL":
            if (!state.producerEditor) return state;
            return {
                ...state,
                producerEditor: { ...state.producerEditor, dsl: action.payload },
            };
        case "MARK_PRODUCER_DIRTY":
            if (!state.producerEditor) return state;
            return {
                ...state,
                producerEditor: { ...state.producerEditor, dirty: true },
            };
        case "MARK_PRODUCER_CLEAN":
            if (!state.producerEditor) return state;
            return {
                ...state,
                producerEditor: { ...state.producerEditor, dirty: false },
            };
        case "CLEAR_FOCUS_NEW_DRAFT":
            if (!state.producerEditor) return state;
            return {
                ...state,
                producerEditor: { ...state.producerEditor, focusNewDraft: false },
            };
        case "CLOSE_PRODUCER_EDITOR":
            return { mode: "testBuilder", producerEditor: null };
        default:
            return state;
    }
}

// ─── Context ─────────────────────────────────────────────────────────────────

interface AppModeContextValue {
    state: AppModeState;
    dispatch: React.Dispatch<AppModeAction>;
}

const AppModeContext = createContext<AppModeContextValue | null>(null);

export function AppModeProvider({ children }: { children: ReactNode }) {
    const [state, dispatch] = useReducer(reducer, initialState);
    return (
        <AppModeContext.Provider value={{ state, dispatch }}>
            {children}
        </AppModeContext.Provider>
    );
}

export function useAppMode(): AppModeContextValue {
    const ctx = useContext(AppModeContext);
    if (!ctx) throw new Error("useAppMode must be used within AppModeProvider");
    return ctx;
}

export type { AppModeAction };
