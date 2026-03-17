import { createContext, useContext, useState, useCallback, type ReactNode } from "react";
import { MicrosoftCopilotStudioService } from "../generated/index.ts";

const AGENT_SCHEMA = "ape_powerautomateanalysisagent";
const NOTIFICATION_URL = "https://notificationurlplaceholder";

export interface ChatMessage {
    role: "user" | "agent";
    text: string;
}

interface CopilotState {
    open: boolean;
    messages: ChatMessage[];
    loading: boolean;
    error: string | null;
    conversationId: string | null;
}

interface CopilotContextValue extends CopilotState {
    open_: () => void;
    close: () => void;
    sendMessage: (text: string) => Promise<void>;
}

const CopilotContext = createContext<CopilotContextValue | null>(null);

export function CopilotProvider({ children }: { children: ReactNode }) {
    const [state, setState] = useState<CopilotState>({
        open: false,
        messages: [],
        loading: false,
        error: null,
        conversationId: null,
    });

    const open_ = useCallback(() => setState(s => ({ ...s, open: true })), []);
    const close = useCallback(() => setState(s => ({ ...s, open: false })), []);

    const sendMessage = useCallback(async (text: string) => {
        setState(s => ({
            ...s,
            loading: true,
            error: null,
            messages: [...s.messages, { role: "user", text }],
        }));

        try {
            const result = await MicrosoftCopilotStudioService.ExecuteCopilotAsyncV2(
                AGENT_SCHEMA,
                { message: text, notificationUrl: NOTIFICATION_URL },
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
        <CopilotContext.Provider value={{ ...state, open_: open_, close, sendMessage }}>
            {children}
        </CopilotContext.Provider>
    );
}

export function useCopilot() {
    const ctx = useContext(CopilotContext);
    if (!ctx) throw new Error("useCopilot must be used inside CopilotProvider");
    return ctx;
}
