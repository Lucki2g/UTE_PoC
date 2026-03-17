import { useRef, useEffect, useState, useCallback, type KeyboardEvent } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Components } from "react-markdown";
import {
    Button,
    Spinner,
    Text,
    tokens,
    makeStyles,
    mergeClasses,
} from "@fluentui/react-components";
import {
    Dismiss20Regular,
    Send20Regular,
    ArrowMaximize20Regular,
    ArrowMinimize20Regular,
    Tag20Regular,
    Lightbulb20Regular,
    Delete20Regular,
} from "@fluentui/react-icons";
import {
    useCopilot,
    type ChatTag,
    type TagOption,
    type MessagePart,
    type LoadingPhase,
} from "../contexts/CopilotContext.tsx";
import copilotIcon from "../assets/copilot-icon.svg";
import claudeIcon from "../assets/claude-ai-icon.svg";
import testIcon from "../assets/testengine-banner-icon.png";

// ─── Styles ──────────────────────────────────────────────────────────────────

const useStyles = makeStyles({
    backdrop: {
        position: "fixed",
        inset: 0,
        backgroundColor: "rgba(0,0,0,0.4)",
        zIndex: 1001,
    },
    panel: {
        position: "fixed",
        zIndex: 1002,
        display: "flex",
        flexDirection: "column",
        backgroundColor: tokens.colorNeutralBackground1,
        borderRadius: tokens.borderRadiusLarge,
        boxShadow: tokens.shadow64,
        border: `1px solid ${tokens.colorNeutralStroke2}`,
        overflow: "hidden",
    },
    panelNormal: {
        bottom: "84px",
        right: "24px",
        width: "380px",
        height: "540px",
    },
    panelFullscreen: {
        top: "5vh",
        left: "5vw",
        width: "90vw",
        height: "90vh",
    },
    panelHeader: {
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: `10px ${tokens.spacingHorizontalM}`,
        background: "linear-gradient(135deg, #0f62fe 0%, #6929c4 100%)",
        flexShrink: 0,
    },
    headerLeft: {
        display: "flex",
        alignItems: "center",
        gap: tokens.spacingHorizontalS,
    },
    headerIconWrap: {
        position: "relative",
        width: "28px",
        height: "28px",
        flexShrink: 0,
    },
    headerIcon: { width: "28px", height: "28px" },
    headerClaudeIcon: {
        position: "absolute",
        bottom: "-3px",
        right: "-3px",
        width: "14px",
        height: "14px",
        borderRadius: "50%",
        border: "1.5px solid white",
        backgroundColor: "white",
    },
    headerActions: {
        display: "flex",
        alignItems: "center",
        gap: "2px",
    },
    messages: {
        flex: 1,
        overflowY: "auto",
        padding: tokens.spacingHorizontalM,
        display: "flex",
        flexDirection: "column",
        gap: tokens.spacingVerticalS,
    },
    welcomeWrap: {
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: tokens.spacingVerticalM,
        marginTop: tokens.spacingVerticalXXL,
        padding: `0 ${tokens.spacingHorizontalM}`,
    },
    welcomeIcon: { width: "48px", height: "48px" },
    guidanceBtn: {
        display: "flex",
        alignItems: "center",
        gap: tokens.spacingHorizontalS,
        padding: `${tokens.spacingVerticalS} ${tokens.spacingHorizontalM}`,
        borderRadius: tokens.borderRadiusMedium,
        border: `1px solid ${tokens.colorNeutralStroke1}`,
        backgroundColor: tokens.colorNeutralBackground2,
        cursor: "pointer",
        width: "100%",
        color: tokens.colorNeutralForeground1,
        marginTop: tokens.spacingVerticalS,
        "&:hover": { backgroundColor: tokens.colorNeutralBackground3 },
    },
    bubble: {
        maxWidth: "82%",
        padding: `${tokens.spacingVerticalXS} ${tokens.spacingHorizontalS}`,
        borderRadius: tokens.borderRadiusMedium,
        wordBreak: "break-word",
    },
    userBubble: {
        alignSelf: "flex-end",
        background: "linear-gradient(135deg, #0f62fe, #6929c4)",
        color: tokens.colorNeutralForegroundOnBrand,
        borderBottomRightRadius: "4px",
    },
    agentBubble: {
        alignSelf: "flex-start",
        backgroundColor: tokens.colorNeutralBackground3,
        color: tokens.colorNeutralForeground1,
        borderBottomLeftRadius: "4px",
    },
    inlineTag: {
        display: "inline-flex",
        alignItems: "center",
        gap: "3px",
        padding: "1px 7px",
        borderRadius: tokens.borderRadiusCircular,
        backgroundColor: "rgba(255,255,255,0.25)",
        color: "inherit",
        fontSize: tokens.fontSizeBase100,
        fontWeight: tokens.fontWeightSemibold,
        verticalAlign: "middle",
    },
    inputArea: {
        flexShrink: 0,
        borderTop: `1px solid ${tokens.colorNeutralStroke2}`,
        backgroundColor: tokens.colorNeutralBackground1,
    },
    // The composed input row: pill tokens + textarea together
    composedInput: {
        display: "flex",
        flexWrap: "wrap",
        alignItems: "center",
        gap: "4px",
        border: `1px solid ${tokens.colorNeutralStroke1}`,
        borderRadius: tokens.borderRadiusMedium,
        padding: "6px 8px",
        backgroundColor: tokens.colorNeutralBackground2,
        flex: 1,
        cursor: "text",
        minHeight: "38px",
    },
    composedInputToken: {
        display: "inline-flex",
        alignItems: "center",
        gap: "4px",
        padding: "2px 8px",
        borderRadius: tokens.borderRadiusCircular,
        backgroundColor: tokens.colorBrandBackground2,
        color: tokens.colorBrandForeground1,
        fontSize: tokens.fontSizeBase100,
        fontWeight: tokens.fontWeightSemibold,
        cursor: "pointer",
        flexShrink: 0,
    },
    composedTextarea: {
        flex: 1,
        minWidth: "60px",
        border: "none",
        outline: "none",
        background: "transparent",
        fontFamily: "inherit",
        fontSize: tokens.fontSizeBase300,
        color: tokens.colorNeutralForeground1,
        resize: "none",
        lineHeight: "1.4",
        padding: "0",
    },
    inputRow: {
        display: "flex",
        gap: tokens.spacingHorizontalXS,
        padding: tokens.spacingHorizontalS,
        alignItems: "flex-end",
    },
    error: {
        padding: `${tokens.spacingVerticalXS} ${tokens.spacingHorizontalM}`,
        color: tokens.colorPaletteRedForeground1,
        fontSize: tokens.fontSizeBase200,
    },
    dropdownWrap: {
        position: "absolute",
        bottom: "100%",
        left: 0,
        right: 0,
        backgroundColor: tokens.colorNeutralBackground1,
        border: `1px solid ${tokens.colorNeutralStroke1}`,
        borderRadius: tokens.borderRadiusMedium,
        boxShadow: tokens.shadow16,
        maxHeight: "220px",
        overflowY: "auto",
        zIndex: 10,
    },
    dropdownItem: {
        display: "flex",
        flexDirection: "column",
        padding: `${tokens.spacingVerticalXS} ${tokens.spacingHorizontalM}`,
        cursor: "pointer",
        "&:hover": { backgroundColor: tokens.colorNeutralBackground3 },
    },
    dropdownItemActive: { backgroundColor: tokens.colorNeutralBackground3 },
    dropdownGroup: {
        padding: `4px ${tokens.spacingHorizontalM} 2px`,
        fontSize: tokens.fontSizeBase100,
        color: tokens.colorNeutralForeground3,
        fontWeight: tokens.fontWeightSemibold,
        textTransform: "uppercase",
        letterSpacing: "0.06em",
    },
    // Markdown styles
    mdPara: { margin: "0 0 6px 0", fontSize: tokens.fontSizeBase300, lineHeight: "1.5" },
    mdPre: {
        backgroundColor: tokens.colorNeutralBackground2,
        borderRadius: tokens.borderRadiusSmall,
        padding: "8px",
        overflowX: "auto",
        fontSize: tokens.fontSizeBase200,
        margin: "4px 0",
        fontFamily: "monospace",
    },
    mdCode: {
        backgroundColor: tokens.colorNeutralBackground2,
        borderRadius: tokens.borderRadiusSmall,
        padding: "1px 4px",
        fontSize: "0.9em",
        fontFamily: "monospace",
    },
    mdList: { paddingLeft: "18px", margin: "4px 0" },
    mdListItem: { margin: "2px 0", fontSize: tokens.fontSizeBase300, lineHeight: "1.5" },
    mdBlockquote: {
        borderLeft: `3px solid ${tokens.colorBrandStroke1}`,
        margin: "4px 0",
        paddingLeft: "10px",
        color: tokens.colorNeutralForeground2,
    },
    mdTable: { borderCollapse: "collapse", width: "100%", fontSize: tokens.fontSizeBase200, margin: "4px 0" },
    mdTh: { border: `1px solid ${tokens.colorNeutralStroke1}`, padding: "4px 8px", backgroundColor: tokens.colorNeutralBackground3, fontWeight: tokens.fontWeightSemibold, textAlign: "left" },
    mdTd: { border: `1px solid ${tokens.colorNeutralStroke1}`, padding: "4px 8px" },
    mdH1: { fontSize: tokens.fontSizeBase500, fontWeight: tokens.fontWeightSemibold, margin: "8px 0 4px", lineHeight: "1.3" },
    mdH2: { fontSize: tokens.fontSizeBase400, fontWeight: tokens.fontWeightSemibold, margin: "6px 0 4px", lineHeight: "1.3" },
    mdH3: { fontSize: tokens.fontSizeBase300, fontWeight: tokens.fontWeightSemibold, margin: "4px 0 2px", lineHeight: "1.3" },
    mdLink: { color: tokens.colorBrandForeground1 },
    mdHr: { border: "none", borderTop: `1px solid ${tokens.colorNeutralStroke1}`, margin: "8px 0" },
    loadingBar: {
        alignSelf: "flex-start",
        display: "flex",
        flexDirection: "column",
        gap: "6px",
        maxWidth: "82%",
        width: "220px",
    },
    loadingTrack: {
        height: "4px",
        borderRadius: "2px",
        backgroundColor: tokens.colorNeutralBackground3,
        overflow: "hidden",
    },
    loadingFill: {
        height: "100%",
        borderRadius: "2px",
        background: "linear-gradient(90deg, #0f62fe, #8c48ff, #f2598a, #0f62fe)",
        backgroundSize: "200% 100%",
        animationName: {
            from: { backgroundPosition: "200% 0" },
            to: { backgroundPosition: "-200% 0" },
        },
        animationDuration: "1.8s",
        animationTimingFunction: "linear",
        animationIterationCount: "infinite",
        width: "100%",
    },
});

// ─── Markdown renderer ────────────────────────────────────────────────────────

function MarkdownContent({ content }: { content: string }) {
    const styles = useStyles();
    const components: Components = {
        p: ({ children }) => <div className={styles.mdPara}>{children}</div>,
        pre: ({ children }) => <pre className={styles.mdPre}>{children}</pre>,
        code: ({ children, className }) =>
            className ? <code className={className}>{children}</code> : <code className={styles.mdCode}>{children}</code>,
        ul: ({ children }) => <ul className={styles.mdList}>{children}</ul>,
        ol: ({ children }) => <ol className={styles.mdList}>{children}</ol>,
        li: ({ children }) => <li className={styles.mdListItem}>{children}</li>,
        blockquote: ({ children }) => <blockquote className={styles.mdBlockquote}>{children}</blockquote>,
        table: ({ children }) => <table className={styles.mdTable}>{children}</table>,
        th: ({ children }) => <th className={styles.mdTh}>{children}</th>,
        td: ({ children }) => <td className={styles.mdTd}>{children}</td>,
        h1: ({ children }) => <div className={styles.mdH1}>{children}</div>,
        h2: ({ children }) => <div className={styles.mdH2}>{children}</div>,
        h3: ({ children }) => <div className={styles.mdH3}>{children}</div>,
        a: ({ href, children }) => <a href={href} className={styles.mdLink} target="_blank" rel="noopener noreferrer">{children}</a>,
        hr: () => <hr className={styles.mdHr} />,
        strong: ({ children }) => <strong style={{ fontWeight: tokens.fontWeightSemibold }}>{children}</strong>,
        em: ({ children }) => <em>{children}</em>,
    };
    return <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>{content}</ReactMarkdown>;
}

// ─── Inline user message renderer ────────────────────────────────────────────

function UserMessageParts({ parts }: { parts: MessagePart[] }) {
    const styles = useStyles();
    return (
        <>
            {parts.map((p, i) =>
                p.kind === "text"
                    ? <Text key={i} size={300}>{p.text}</Text>
                    : <span key={i} className={styles.inlineTag}>
                        <Tag20Regular style={{ width: "10px", height: "10px" }} />
                        {p.tag.label}
                    </span>
            )}
        </>
    );
}

// ─── Tag dropdown ─────────────────────────────────────────────────────────────

function TagDropdown({ options, loading, filter, activeIndex, onSelect }: {
    options: TagOption[];
    loading: boolean;
    filter: string;
    activeIndex: number;
    onSelect: (opt: TagOption) => void;
}) {
    const styles = useStyles();
    const filtered = filter
        ? options.filter(o => o.label.toLowerCase().includes(filter.toLowerCase()) || o.group.toLowerCase().includes(filter.toLowerCase()))
        : options;
    const grouped = filtered.reduce<Record<string, TagOption[]>>((acc, o) => { (acc[o.group] ??= []).push(o); return acc; }, {});

    if (loading) return (
        <div className={styles.dropdownWrap} style={{ padding: "12px", display: "flex", alignItems: "center", gap: "8px" }}>
            <Spinner size="tiny" /><Text size={200}>Loading workflows…</Text>
        </div>
    );
    if (!filtered.length) return (
        <div className={styles.dropdownWrap} style={{ padding: "10px 14px" }}>
            <Text size={200} style={{ color: tokens.colorNeutralForeground3 }}>No matches</Text>
        </div>
    );

    let idx = 0;
    return (
        <div className={styles.dropdownWrap}>
            {Object.entries(grouped).map(([group, items]) => (
                <div key={group}>
                    <div className={styles.dropdownGroup}>{group}</div>
                    {items.map(opt => {
                        const i = idx++;
                        return (
                            <div
                                key={opt.value}
                                className={mergeClasses(styles.dropdownItem, i === activeIndex ? styles.dropdownItemActive : undefined)}
                                onMouseDown={e => { e.preventDefault(); onSelect(opt); }}
                            >
                                <Text size={200} weight="semibold">{opt.label}</Text>
                            </div>
                        );
                    })}
                </div>
            ))}
        </div>
    );
}

// ─── Loading indicator ────────────────────────────────────────────────────────

const PHASE_LABELS: Record<NonNullable<LoadingPhase>, string> = {
    "fetching-context": "Fetching relevant context from Bedrock project…",
    "awaiting-agent": "Formulating response…",
};

function LoadingIndicator({ phase }: { phase: LoadingPhase }) {
    const styles = useStyles();
    const label = phase ? PHASE_LABELS[phase] : PHASE_LABELS["awaiting-agent"];
    return (
        <div className={styles.loadingBar}>
            <Text size={100} style={{ color: tokens.colorNeutralForeground3 }}>{label}</Text>
            <div className={styles.loadingTrack}>
                <div className={styles.loadingFill} />
            </div>
        </div>
    );
}

// ─── Guidance topic button ────────────────────────────────────────────────────

function GuidanceButton({ onTrigger }: { onTrigger: () => void }) {
    const styles = useStyles();
    return (
        <button className={styles.guidanceBtn} onClick={onTrigger}>
            <Lightbulb20Regular style={{ flexShrink: 0, color: tokens.colorBrandForeground1 }} />
            <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start" }}>
                <Text size={300} weight="semibold">Guidance</Text>
                <Text size={100} style={{ color: tokens.colorNeutralForeground3 }}>
                    How would I create tests for a specific workflow?
                </Text>
            </div>
        </button>
    );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function CopilotChat() {
    const copilot = useCopilot();
    const styles = useStyles();
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    // Composed input state: list of parts (text segments + inline tags)
    const [inputParts, setInputParts] = useState<MessagePart[]>([{ kind: "text", text: "" }]);
    const [showTagDropdown, setShowTagDropdown] = useState(false);
    const [tagFilter, setTagFilter] = useState("");
    const [tagActiveIdx, setTagActiveIdx] = useState(0);

    // The current text of the last text-part (what the textarea shows)
    const hasContent = inputParts.some(p => (p.kind === "text" && p.text.trim()) || p.kind === "tag");

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [copilot.messages, copilot.loading]);

    useEffect(() => {
        if (copilot.open && copilot.tagOptions.length === 0) {
            copilot.loadTagOptions();
        }
    }, [copilot.open]); // eslint-disable-line react-hooks/exhaustive-deps

    const filteredOptions = tagFilter
        ? copilot.tagOptions.filter(o => o.label.toLowerCase().includes(tagFilter.toLowerCase()))
        : copilot.tagOptions;

    const updateCurrentText = useCallback((text: string) => {
        setInputParts(prev => {
            const parts = [...prev];
            if (parts.length === 0 || parts[parts.length - 1].kind !== "text") {
                parts.push({ kind: "text", text });
            } else {
                parts[parts.length - 1] = { kind: "text", text };
            }
            return parts;
        });
    }, []);

    const handleTextareaChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
        const val = e.target.value;
        // Auto-resize
        const el = e.target;
        el.style.height = "auto";
        el.style.height = Math.min(el.scrollHeight, 120) + "px";

        // Check for "/" trigger at start of current text segment
        const lastSlash = val.lastIndexOf("/");
        if (lastSlash !== -1 && (lastSlash === 0 || val[lastSlash - 1] === " ")) {
            setTagFilter(val.slice(lastSlash + 1));
            setShowTagDropdown(true);
            setTagActiveIdx(0);
            updateCurrentText(val);
        } else {
            setShowTagDropdown(false);
            updateCurrentText(val);
        }
    }, [updateCurrentText]);

    const commitTag = useCallback((opt: TagOption) => {
        const tag: ChatTag = { type: opt.type, label: opt.label, value: opt.value };
        setInputParts(prev => {
            const parts = [...prev];
            // Trim the "/" + filter from the last text part
            if (parts.length > 0 && parts[parts.length - 1].kind === "text") {
                const lastText = (parts[parts.length - 1] as { kind: "text"; text: string }).text;
                const slashIdx = lastText.lastIndexOf("/");
                parts[parts.length - 1] = { kind: "text", text: slashIdx !== -1 ? lastText.slice(0, slashIdx) : lastText };
            }
            parts.push({ kind: "tag", tag });
            parts.push({ kind: "text", text: " " });
            return parts;
        });
        setShowTagDropdown(false);
        setTagFilter("");
        setTimeout(() => textareaRef.current?.focus(), 0);
    }, []);

    const removeToken = useCallback((partIdx: number) => {
        setInputParts(prev => {
            const parts = prev.filter((_, i) => i !== partIdx);
            // Merge adjacent text parts
            const merged: MessagePart[] = [];
            for (const p of parts) {
                if (p.kind === "text" && merged.length > 0 && merged[merged.length - 1].kind === "text") {
                    merged[merged.length - 1] = { kind: "text", text: (merged[merged.length - 1] as { kind: "text"; text: string }).text + p.text };
                } else {
                    merged.push(p);
                }
            }
            return merged.length ? merged : [{ kind: "text", text: "" }];
        });
    }, []);

    const handleSend = useCallback(async () => {
        if (!hasContent || copilot.loading) return;
        const parts = inputParts;
        setInputParts([{ kind: "text", text: "" }]);
        setShowTagDropdown(false);
        if (textareaRef.current) textareaRef.current.style.height = "auto";
        await copilot.sendMessage(parts);
    }, [inputParts, hasContent, copilot]);

    const handleKeyDown = useCallback((e: KeyboardEvent<HTMLTextAreaElement>) => {
        if (showTagDropdown) {
            if (e.key === "ArrowDown") { e.preventDefault(); setTagActiveIdx(i => Math.min(i + 1, filteredOptions.length - 1)); return; }
            if (e.key === "ArrowUp") { e.preventDefault(); setTagActiveIdx(i => Math.max(i - 1, 0)); return; }
            if (e.key === "Enter" || e.key === "Tab") {
                e.preventDefault();
                const opt = filteredOptions[tagActiveIdx];
                if (opt) commitTag(opt);
                return;
            }
            if (e.key === "Escape") { setShowTagDropdown(false); return; }
        }
        if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); }
    }, [showTagDropdown, filteredOptions, tagActiveIdx, commitTag, handleSend]);

    // Guidance topic: pre-fill input with the template parts, wait for user to pick a workflow via "/"
    const handleGuidanceTrigger = useCallback(() => {
        setInputParts([
            { kind: "text", text: "How would I create tests for /" },
        ]);
        setShowTagDropdown(true);
        setTagFilter("");
        setTagActiveIdx(0);
        setTimeout(() => {
            const ta = textareaRef.current;
            if (ta) {
                ta.focus();
                ta.setSelectionRange(ta.value.length, ta.value.length);
            }
        }, 0);
    }, []);

    // Handle guidance topic when a tag is selected — auto-send with context
    const handleGuidanceTagSelect = useCallback((opt: TagOption) => {
        setShowTagDropdown(false);
        setTagFilter("");
        setInputParts([{ kind: "text", text: "" }]);
        copilot.sendGuidanceMessage(opt.value);
    }, [copilot]);

    // Detect if we're in "guidance mode" (input starts with the guidance template)
    const isGuidanceMode = inputParts.length === 1
        && inputParts[0].kind === "text"
        && (inputParts[0] as { kind: "text"; text: string }).text.startsWith("How would I create tests for /");

    const isFullscreen = copilot.fullscreen;

    return (
        <>
            {copilot.open && isFullscreen && (
                <div className={styles.backdrop} onClick={copilot.close} />
            )}

            {copilot.open && (
                <div className={mergeClasses(styles.panel, isFullscreen ? styles.panelFullscreen : styles.panelNormal)}>

                    {/* Header */}
                    <div className={styles.panelHeader}>
                        <div className={styles.headerLeft}>
                            <div className={styles.headerIconWrap}>
                                <img src={copilotIcon} alt="" className={styles.headerIcon} />
                                <img src={claudeIcon} alt="" className={styles.headerClaudeIcon} />
                            </div>
                            <div>
                                <Text weight="semibold" size={300} style={{ color: "white", display: "block" }}>Copilot / Claude Assistant</Text>
                                <Text size={100} style={{ color: "rgba(255,255,255,0.75)" }}>Power Automate Agent & Bedrock Framework Agent</Text>
                            </div>
                        </div>
                        <div className={styles.headerActions}>
                            {copilot.messages.length > 0 && (
                                <Button appearance="transparent" icon={<Delete20Regular />}
                                    onClick={copilot.clearMessages} style={{ color: "white", minWidth: "unset" }}
                                    aria-label="Clear chat" title="Clear chat" />
                            )}
                            <Button appearance="transparent" icon={isFullscreen ? <ArrowMinimize20Regular /> : <ArrowMaximize20Regular />}
                                onClick={copilot.toggleFullscreen} style={{ color: "white", minWidth: "unset" }}
                                aria-label={isFullscreen ? "Minimize" : "Fullscreen"} />
                            <Button appearance="transparent" icon={<Dismiss20Regular />}
                                onClick={copilot.close} style={{ color: "white", minWidth: "unset" }} aria-label="Close" />
                        </div>
                    </div>

                    {/* Messages */}
                    <div className={styles.messages}>
                        {copilot.messages.length === 0 ? (
                            <div className={styles.welcomeWrap}>
                                <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                                    <img src={testIcon} alt="" className={styles.welcomeIcon} />
                                    <Text size={900} style={{ color: tokens.colorNeutralForeground3 }}>/</Text>
                                    <img src={copilotIcon} alt="" className={styles.welcomeIcon} />
                                </div>
                                <Text weight="semibold" size={400}>How can I help you?</Text>
                                <Text size={200} style={{ color: tokens.colorNeutralForeground3, textAlign: "center" }}>
                                    Ask me about testing your processes. Type <strong>/</strong> to tag a workflow.
                                </Text>
                                <GuidanceButton onTrigger={handleGuidanceTrigger} />
                            </div>
                        ) : (
                            copilot.messages.map((msg, i) => (
                                <div key={i} className={mergeClasses(styles.bubble, msg.role === "user" ? styles.userBubble : styles.agentBubble)}>
                                    {msg.role === "user"
                                        ? <UserMessageParts parts={msg.parts ?? [{ kind: "text", text: msg.text ?? "" }]} />
                                        : <MarkdownContent content={msg.text ?? ""} />
                                    }
                                </div>
                            ))
                        )}
                        {copilot.loading && <LoadingIndicator phase={copilot.loadingPhase} />}
                        <div ref={messagesEndRef} />
                    </div>

                    {copilot.error && <Text className={styles.error}>{copilot.error}</Text>}

                    {/* Input area */}
                    <div className={styles.inputArea}>
                        <div style={{ position: "relative" }}>
                            {showTagDropdown && (
                                <TagDropdown
                                    options={copilot.tagOptions}
                                    loading={copilot.tagOptionsLoading}
                                    filter={tagFilter}
                                    activeIndex={tagActiveIdx}
                                    onSelect={isGuidanceMode ? handleGuidanceTagSelect : commitTag}
                                />
                            )}
                        </div>

                        <div className={styles.inputRow}>
                            {/* Composed input: inline tag tokens + textarea */}
                            <div className={styles.composedInput} onClick={() => textareaRef.current?.focus()}>
                                {inputParts.map((part, i) =>
                                    part.kind === "tag"
                                        ? <span key={i} className={styles.composedInputToken} onClick={e => { e.stopPropagation(); removeToken(i); }} title="Click to remove">
                                            <Tag20Regular style={{ width: "10px", height: "10px" }} />
                                            {part.tag.label} ×
                                        </span>
                                        : i === inputParts.length - 1
                                            ? <textarea
                                                key={i}
                                                ref={textareaRef}
                                                className={styles.composedTextarea}
                                                placeholder={inputParts.length === 1 ? 'Message… (type "/" to tag a workflow)' : ""}
                                                value={part.text}
                                                onChange={handleTextareaChange}
                                                onKeyDown={handleKeyDown}
                                                disabled={copilot.loading}
                                                rows={1}
                                            />
                                            : <Text key={i} size={300}>{part.text}</Text>
                                )}
                            </div>
                            <Button
                                appearance="primary"
                                icon={<Send20Regular />}
                                onClick={handleSend}
                                disabled={!hasContent || copilot.loading}
                                aria-label="Send"
                                style={{ height: "38px", minWidth: "38px" }}
                            />
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
