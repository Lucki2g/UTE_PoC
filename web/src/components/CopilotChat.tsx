import { useRef, useEffect, useState } from "react";
import {
    Button,
    Input,
    Spinner,
    Text,
    tokens,
    makeStyles,
} from "@fluentui/react-components";
import { Dismiss20Regular, Send20Regular, Bot20Regular } from "@fluentui/react-icons";
import { useCopilot } from "../contexts/CopilotContext.tsx";

const useStyles = makeStyles({
    fab: {
        position: "fixed",
        bottom: "24px",
        right: "24px",
        zIndex: 1000,
        borderRadius: tokens.borderRadiusCircular,
        width: "48px",
        height: "48px",
        minWidth: "unset",
        boxShadow: tokens.shadow16,
    },
    panel: {
        position: "fixed",
        bottom: "80px",
        right: "24px",
        width: "360px",
        height: "520px",
        zIndex: 1000,
        display: "flex",
        flexDirection: "column",
        backgroundColor: tokens.colorNeutralBackground1,
        borderRadius: tokens.borderRadiusLarge,
        boxShadow: tokens.shadow28,
        border: `1px solid ${tokens.colorNeutralStroke2}`,
        overflow: "hidden",
    },
    panelHeader: {
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: `${tokens.spacingVerticalS} ${tokens.spacingHorizontalM}`,
        backgroundColor: tokens.colorBrandBackground,
        color: tokens.colorNeutralForegroundOnBrand,
    },
    messages: {
        flex: 1,
        overflowY: "auto",
        padding: tokens.spacingHorizontalM,
        display: "flex",
        flexDirection: "column",
        gap: tokens.spacingVerticalS,
    },
    bubble: {
        maxWidth: "80%",
        padding: `${tokens.spacingVerticalXS} ${tokens.spacingHorizontalS}`,
        borderRadius: tokens.borderRadiusMedium,
        wordBreak: "break-word",
    },
    userBubble: {
        alignSelf: "flex-end",
        backgroundColor: tokens.colorBrandBackground,
        color: tokens.colorNeutralForegroundOnBrand,
    },
    agentBubble: {
        alignSelf: "flex-start",
        backgroundColor: tokens.colorNeutralBackground3,
        color: tokens.colorNeutralForeground1,
    },
    inputRow: {
        display: "flex",
        gap: tokens.spacingHorizontalS,
        padding: tokens.spacingHorizontalS,
        borderTop: `1px solid ${tokens.colorNeutralStroke2}`,
        alignItems: "center",
    },
    error: {
        margin: `0 ${tokens.spacingHorizontalM} ${tokens.spacingVerticalXS}`,
        color: tokens.colorPaletteRedForeground1,
        fontSize: tokens.fontSizeBase200,
    },
});

export function CopilotChat() {
    const copilot = useCopilot();
    const styles = useStyles();
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const [input, setInput] = useState("");

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [copilot.messages, copilot.loading]);

    const handleSend = async () => {
        const text = input.trim();
        if (!text || copilot.loading) return;
        setInput("");
        await copilot.sendMessage(text);
    };

    return (
        <>
            <Button
                appearance="primary"
                className={styles.fab}
                icon={<Bot20Regular />}
                onClick={copilot.open ? copilot.close : copilot.open_}
                aria-label="Open Copilot chat"
            />

            {copilot.open && (
                <div className={styles.panel}>
                    <div className={styles.panelHeader}>
                        <Text weight="semibold" style={{ color: "inherit" }}>Copilot Assistant</Text>
                        <Button
                            appearance="transparent"
                            icon={<Dismiss20Regular />}
                            onClick={copilot.close}
                            style={{ color: "inherit", minWidth: "unset" }}
                            aria-label="Close"
                        />
                    </div>

                    <div className={styles.messages}>
                        {copilot.messages.length === 0 && (
                            <Text size={200} style={{ color: tokens.colorNeutralForeground3, alignSelf: "center", marginTop: tokens.spacingVerticalXXL }}>
                                Ask me anything about your flows...
                            </Text>
                        )}
                        {copilot.messages.map((msg, i) => (
                            <div
                                key={i}
                                className={`${styles.bubble} ${msg.role === "user" ? styles.userBubble : styles.agentBubble}`}
                            >
                                <Text size={300}>{msg.text}</Text>
                            </div>
                        ))}
                        {copilot.loading && (
                            <div className={styles.agentBubble} style={{ alignSelf: "flex-start", padding: tokens.spacingHorizontalS, borderRadius: tokens.borderRadiusMedium }}>
                                <Spinner size="tiny" />
                            </div>
                        )}
                        <div ref={messagesEndRef} />
                    </div>

                    {copilot.error && (
                        <Text className={styles.error}>{copilot.error}</Text>
                    )}

                    <div className={styles.inputRow}>
                        <Input
                            style={{ flex: 1 }}
                            placeholder="Type a message..."
                            value={input}
                            onChange={(_e, d) => setInput(d.value)}
                            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) handleSend(); }}
                            disabled={copilot.loading}
                        />
                        <Button
                            appearance="primary"
                            icon={<Send20Regular />}
                            onClick={handleSend}
                            disabled={!input.trim() || copilot.loading}
                            aria-label="Send"
                        />
                    </div>
                </div>
            )}
        </>
    );
}
