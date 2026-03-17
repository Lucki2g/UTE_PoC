import { createContext, useContext, useState, useCallback, type ReactNode } from "react";
import { MicrosoftCopilotStudioService } from "../generated/index.ts";
import { api } from "../services/apiClient.ts";
import type { TestMetadata, ProducerMetadata } from "../models/responses.ts";

const AGENT_SCHEMA = "ape_powerautomateanalysisagent";
const NOTIFICATION_URL = "https://notificationurlplaceholder";

export interface ChatTag {
    type: "workflow";
    label: string;
    value: string;
}

// A message part is either plain text or an inline tag
export type MessagePart = { kind: "text"; text: string } | { kind: "tag"; tag: ChatTag };

export interface ChatMessage {
    role: "user" | "agent";
    // For display: structured parts (user messages)
    parts?: MessagePart[];
    // For agent messages: raw markdown text
    text?: string;
}

export interface TagOption {
    type: ChatTag["type"];
    label: string;
    value: string;
    group: string;
}

export type LoadingPhase = "fetching-context" | "awaiting-agent" | null;

interface CopilotState {
    open: boolean;
    fullscreen: boolean;
    messages: ChatMessage[];
    loading: boolean;
    loadingPhase: LoadingPhase;
    error: string | null;
    conversationId: string | null;
    tagOptions: TagOption[];
    tagOptionsLoading: boolean;
}

export interface CopilotContextValue extends CopilotState {
    openChat: () => void;
    close: () => void;
    toggleFullscreen: () => void;
    clearMessages: () => void;
    sendMessage: (parts: MessagePart[]) => Promise<void>;
    sendGuidanceMessage: (workflowName: string) => Promise<void>;
    loadTagOptions: () => Promise<void>;
}

const CopilotContext = createContext<CopilotContextValue | null>(null);

// Build plain text from parts for sending to the agent
function partsToText(parts: MessagePart[]): string {
    return parts.map(p => p.kind === "text" ? p.text : `[workflow:${p.tag.value}]`).join("").trim();
}

export function CopilotProvider({ children }: { children: ReactNode }) {
    const [state, setState] = useState<CopilotState>({
        open: false,
        fullscreen: false,
        messages: [],
        loading: false,
        loadingPhase: null,
        error: null,
        conversationId: null,
        tagOptions: [],
        tagOptionsLoading: false,
    });

    const openChat = useCallback(() => setState(s => ({ ...s, open: true })), []);
    const close = useCallback(() => setState(s => ({ ...s, open: false, fullscreen: false })), []);
    const toggleFullscreen = useCallback(() => setState(s => ({ ...s, fullscreen: !s.fullscreen })), []);
    const clearMessages = useCallback(() => setState(s => ({ ...s, messages: [], conversationId: null, error: null })), []);

    const loadTagOptions = useCallback(async () => {
        setState(s => ({ ...s, tagOptionsLoading: true }));
        try {
            const names = await api.get<string[]>("/workflows");
            const options: TagOption[] = names.map(name => ({
                type: "workflow" as const,
                label: name,
                value: name,
                group: "Power Automate",
            }));
            setState(s => ({ ...s, tagOptions: options, tagOptionsLoading: false }));
        } catch {
            setState(s => ({ ...s, tagOptionsLoading: false }));
        }
    }, []);

    const dispatchToAgent = useCallback(async (agentMessage: string, displayParts: MessagePart[], currentConvId: string | null, addUserMessage = true) => {
        setState(s => ({
            ...s,
            loading: true,
            loadingPhase: "awaiting-agent",
            error: null,
            messages: addUserMessage ? [...s.messages, { role: "user", parts: displayParts }] : s.messages,
        }));

        try {
            const result = await MicrosoftCopilotStudioService.ExecuteCopilotAsyncV2(
                AGENT_SCHEMA,
                { message: agentMessage, notificationUrl: NOTIFICATION_URL },
                currentConvId ?? undefined,
            );

            const data = result.data as { lastResponse?: string; responses?: string[]; conversationId?: string } | undefined;
            const reply = data?.lastResponse ?? data?.responses?.[0] ?? "(no response)";
            const newConvId = data?.conversationId ?? currentConvId;

            setState(s => ({
                ...s,
                loading: false,
                loadingPhase: null,
                conversationId: newConvId,
                messages: [...s.messages, { role: "agent", text: reply }],
            }));
        } catch (err) {
            setState(s => ({
                ...s,
                loading: false,
                loadingPhase: null,
                error: err instanceof Error ? err.message : String(err),
            }));
        }
    }, []);

    const sendMessage = useCallback(async (parts: MessagePart[]) => {
        const text = partsToText(parts);
        if (!text) return;
        await dispatchToAgent(text, parts, state.conversationId);
    }, [state.conversationId, dispatchToAgent]);

    const sendGuidanceMessage = useCallback(async (workflowName: string) => {
        // Show the user message immediately as typed
        const displayParts: MessagePart[] = [
            { kind: "text", text: "How would I create tests for " },
            { kind: "tag", tag: { type: "workflow", label: workflowName, value: workflowName } },
            { kind: "text", text: "?" },
        ];

        setState(s => ({
            ...s,
            loading: true,
            loadingPhase: "fetching-context",
            error: null,
            messages: [...s.messages, { role: "user", parts: displayParts }],
        }));

        try {
            // Gather context in parallel
            const [tests, producers, workflowJson] = await Promise.all([
                api.get<TestMetadata[]>("/tests/").catch(() => [] as TestMetadata[]),
                api.get<ProducerMetadata[]>("/producers/").catch(() => [] as ProducerMetadata[]),
                api.get<unknown>(`/workflows/${encodeURIComponent(workflowName)}`).catch(() => null),
            ]);

            const agentMessage = buildGuidancePrompt(workflowName, workflowJson, tests, producers);
            await dispatchToAgent(agentMessage, displayParts, state.conversationId, false);
        } catch (err) {
            setState(s => ({
                ...s,
                loading: false,
                error: err instanceof Error ? err.message : String(err),
            }));
        }
    }, [state.conversationId, dispatchToAgent]);

    return (
        <CopilotContext.Provider value={{ ...state, openChat, close, toggleFullscreen, clearMessages, sendMessage, sendGuidanceMessage, loadTagOptions }}>
            {children}
        </CopilotContext.Provider>
    );
}

function extractWorkflowSummary(raw: unknown): object {
    if (!raw || typeof raw !== "object") return {};
    const r = raw as Record<string, unknown>;
    const props = (r["properties"] ?? r) as Record<string, unknown>;
    const def = (props["definition"] ?? {}) as Record<string, unknown>;

    // Extract only trigger names+types and action names+types — drop metadata, auth, schema noise
    const triggers = Object.entries((def["triggers"] ?? {}) as Record<string, unknown>).map(([name, v]) => {
        const t = v as Record<string, unknown>;
        return { name, type: t["type"], description: t["description"] };
    });

    const actions = Object.entries((def["actions"] ?? {}) as Record<string, unknown>).map(([name, v]) => {
        const a = v as Record<string, unknown>;
        const inputs = (a["inputs"] ?? {}) as Record<string, unknown>;
        const host = (inputs["host"] ?? {}) as Record<string, unknown>;
        const params = (inputs["parameters"] ?? {}) as Record<string, unknown>;
        return {
            name,
            type: a["type"],
            operationId: host["operationId"],
            runAfter: a["runAfter"],
            parameters: params,
        };
    });

    const connRefs = Object.keys((props["connectionReferences"] ?? {}) as object);

    return { triggers, actions, connectionReferences: connRefs };
}

function buildGuidancePrompt(
    workflowName: string,
    workflowJson: unknown,
    tests: TestMetadata[],
    producers: ProducerMetadata[],
): string {
    const existingTests = tests.map(t => ({
        class: t.className,
        methods: t.methodNames,
    }));

    const existingProducers = producers.map(p => ({
        entity: p.entityName,
        methods: p.methodNames,
    }));

    const payload = {
        request: `How would I create integration tests for the Power Automate workflow "${workflowName}"?`,
        context: {
            workflow: {
                name: workflowName,
                definition: extractWorkflowSummary(workflowJson),
            },
            existingTests,
            existingProducers,
        },
    };

    return JSON.stringify(payload);
}

export function useCopilot() {
    const ctx = useContext(CopilotContext);
    if (!ctx) throw new Error("useCopilot must be used inside CopilotProvider");
    return ctx;
}
