import { createContext, useContext, useState, useCallback, type ReactNode } from "react";
import { MicrosoftCopilotStudioService } from "../generated/index.ts";
import { api } from "../services/apiClient.ts";
const AGENT_SCHEMA = "ape_powerautomateanalysisagent";
const NOTIFICATION_URL = "https://notificationurlplaceholder";

export interface ChatTag {
    type: "workflow";
    label: string;
    value: string;
}

export interface ChatMessage {
    role: "user" | "agent";
    text: string;
    tags?: ChatTag[];
}

export interface TagOption {
    type: ChatTag["type"];
    label: string;
    value: string;
    group: string;
}

interface CopilotState {
    open: boolean;
    fullscreen: boolean;
    messages: ChatMessage[];
    loading: boolean;
    error: string | null;
    conversationId: string | null;
    tagOptions: TagOption[];
    tagOptionsLoading: boolean;
}

interface CopilotContextValue extends CopilotState {
    openChat: () => void;
    close: () => void;
    toggleFullscreen: () => void;
    sendMessage: (text: string, tags?: ChatTag[]) => Promise<void>;
    loadTagOptions: () => Promise<void>;
}

const CopilotContext = createContext<CopilotContextValue | null>(null);

export function CopilotProvider({ children }: { children: ReactNode }) {
    const [state, setState] = useState<CopilotState>({
        open: false,
        fullscreen: false,
        messages: [],
        loading: false,
        error: null,
        conversationId: null,
        tagOptions: [],
        tagOptionsLoading: false,
    });

    const openChat = useCallback(() => setState(s => ({ ...s, open: true })), []);
    const close = useCallback(() => setState(s => ({ ...s, open: false, fullscreen: false })), []);
    const toggleFullscreen = useCallback(() => setState(s => ({ ...s, fullscreen: !s.fullscreen })), []);

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

    const sendMessage = useCallback(async (text: string, tags?: ChatTag[]) => {
        const tagPrefix = tags?.length
            ? tags.map(t => `[${t.type}:${t.value}]`).join(" ") + " "
            : "";
        const fullMessage = tagPrefix + text;

        setState(s => ({
            ...s,
            loading: true,
            error: null,
            messages: [...s.messages, { role: "user", text, tags }],
        }));

        try {
            const result = await MicrosoftCopilotStudioService.ExecuteCopilotAsyncV2(
                AGENT_SCHEMA,
                { message: fullMessage, notificationUrl: NOTIFICATION_URL },
                state.conversationId ?? undefined,
            );

            const data = result.data as { lastResponse?: string; responses?: string[]; conversationId?: string } | undefined;
            const reply = data?.lastResponse ?? data?.responses?.[0] ?? "(no response)";
            const newConvId = data?.conversationId ?? state.conversationId;

            setState(s => ({
                ...s,
                loading: false,
                conversationId: newConvId,
                messages: [...s.messages, { role: "agent", text: reply }],
            }));
        } catch (err) {
            setState(s => ({
                ...s,
                loading: false,
                error: err instanceof Error ? err.message : String(err),
            }));
        }
    }, [state.conversationId]);

    return (
        <CopilotContext.Provider value={{ ...state, openChat, close, toggleFullscreen, sendMessage, loadTagOptions }}>
            {children}
        </CopilotContext.Provider>
    );
}

export function useCopilot() {
    const ctx = useContext(CopilotContext);
    if (!ctx) throw new Error("useCopilot must be used inside CopilotProvider");
    return ctx;
}
