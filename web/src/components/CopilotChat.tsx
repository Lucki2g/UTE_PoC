import { useRef, useEffect, useState, useCallback, type KeyboardEvent, type ReactNode } from "react";
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
} from "@fluentui/react-icons";
import { useCopilot, type ChatTag, type TagOption } from "../contexts/CopilotContext.tsx";
import copilotIcon from "../assets/copilot-icon.svg";
import claudeIcon from "../assets/claude-ai-icon.svg";

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
    headerIcon: {
        width: "28px",
        height: "28px",
    },
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
    welcomeIcon: {
        width: "56px",
        height: "56px",
    },
    topicsGrid: {
        display: "grid",
        gridTemplateColumns: "1fr 1fr",
        gap: tokens.spacingVerticalS,
        width: "100%",
        marginTop: tokens.spacingVerticalS,
    },
    topicBtn: {
        padding: tokens.spacingVerticalS,
        borderRadius: tokens.borderRadiusMedium,
        border: `1px solid ${tokens.colorNeutralStroke1}`,
        backgroundColor: tokens.colorNeutralBackground2,
        cursor: "pointer",
        textAlign: "left",
        color: tokens.colorNeutralForeground1,
        "&:hover": {
            backgroundColor: tokens.colorNeutralBackground3,
        },
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
    tagsRow: {
        display: "flex",
        flexWrap: "wrap",
        gap: "4px",
        marginBottom: "4px",
    },
    tag: {
        display: "inline-flex",
        alignItems: "center",
        gap: "4px",
        padding: "2px 8px",
        borderRadius: tokens.borderRadiusCircular,
        backgroundColor: tokens.colorBrandBackground2,
        color: tokens.colorBrandForeground1,
        fontSize: tokens.fontSizeBase100,
        fontWeight: tokens.fontWeightSemibold,
    },
    inputArea: {
        flexShrink: 0,
        borderTop: `1px solid ${tokens.colorNeutralStroke2}`,
        backgroundColor: tokens.colorNeutralBackground1,
    },
    pendingTagsRow: {
        display: "flex",
        flexWrap: "wrap",
        gap: "4px",
        padding: `${tokens.spacingVerticalXS} ${tokens.spacingHorizontalS}`,
        paddingBottom: "0",
    },
    pendingTag: {
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
    },
    inputRow: {
        display: "flex",
        gap: tokens.spacingHorizontalXS,
        padding: tokens.spacingHorizontalS,
        alignItems: "flex-end",
    },
    textarea: {
        flex: 1,
        resize: "none",
        border: `1px solid ${tokens.colorNeutralStroke1}`,
        borderRadius: tokens.borderRadiusMedium,
        padding: "8px 10px",
        fontFamily: "inherit",
        fontSize: tokens.fontSizeBase300,
        backgroundColor: tokens.colorNeutralBackground2,
        color: tokens.colorNeutralForeground1,
        outline: "none",
        minHeight: "38px",
        maxHeight: "120px",
        lineHeight: "1.4",
        "&:focus": {
            backgroundColor: tokens.colorNeutralBackground1,
        },
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
    dropdownItemActive: {
        backgroundColor: tokens.colorNeutralBackground3,
    },
    dropdownGroup: {
        padding: `4px ${tokens.spacingHorizontalM} 2px`,
        fontSize: tokens.fontSizeBase100,
        color: tokens.colorNeutralForeground3,
        fontWeight: tokens.fontWeightSemibold,
        textTransform: "uppercase",
        letterSpacing: "0.06em",
    },
    // Markdown block styles
    mdPara: {
        margin: "0 0 6px 0",
        fontSize: tokens.fontSizeBase300,
        lineHeight: "1.5",
    },
    mdParaLast: {
        margin: "0",
    },
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
    mdList: {
        paddingLeft: "18px",
        margin: "4px 0",
    },
    mdListItem: {
        margin: "2px 0",
        fontSize: tokens.fontSizeBase300,
        lineHeight: "1.5",
    },
    mdBlockquote: {
        borderLeft: `3px solid ${tokens.colorBrandStroke1}`,
        margin: "4px 0",
        paddingLeft: "10px",
        color: tokens.colorNeutralForeground2,
    },
    mdTable: {
        borderCollapse: "collapse",
        width: "100%",
        fontSize: tokens.fontSizeBase200,
        margin: "4px 0",
    },
    mdTh: {
        border: `1px solid ${tokens.colorNeutralStroke1}`,
        padding: "4px 8px",
        backgroundColor: tokens.colorNeutralBackground3,
        fontWeight: tokens.fontWeightSemibold,
        textAlign: "left",
    },
    mdTd: {
        border: `1px solid ${tokens.colorNeutralStroke1}`,
        padding: "4px 8px",
    },
    mdH1: {
        fontSize: tokens.fontSizeBase500,
        fontWeight: tokens.fontWeightSemibold,
        margin: "8px 0 4px",
        lineHeight: "1.3",
    },
    mdH2: {
        fontSize: tokens.fontSizeBase400,
        fontWeight: tokens.fontWeightSemibold,
        margin: "6px 0 4px",
        lineHeight: "1.3",
    },
    mdH3: {
        fontSize: tokens.fontSizeBase300,
        fontWeight: tokens.fontWeightSemibold,
        margin: "4px 0 2px",
        lineHeight: "1.3",
    },
    mdLink: {
        color: tokens.colorBrandForeground1,
    },
    mdHr: {
        border: "none",
        borderTop: `1px solid ${tokens.colorNeutralStroke1}`,
        margin: "8px 0",
    },
});

// ─── Markdown renderer ────────────────────────────────────────────────────────

function MarkdownContent({ content }: { content: string }) {
    const styles = useStyles();

    const components: Components = {
        p: ({ children }) => <div className={styles.mdPara}>{children}</div>,
        pre: ({ children }) => <pre className={styles.mdPre}>{children}</pre>,
        code: ({ children, className }) =>
            className
                ? <code className={className}>{children}</code>
                : <code className={styles.mdCode}>{children}</code>,
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

    return (
        <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
            {content}
        </ReactMarkdown>
    );
}

// ─── Suggested topics ────────────────────────────────────────────────────────

const SUGGESTED_TOPICS = [
    { icon: "🔍", label: "Analyse a workflow" },
    { icon: "📋", label: "List failing tests" },
    { icon: "🛠️", label: "Suggest improvements" },
    { icon: "📖", label: "Explain test DSL" },
];

// ─── Tag picker dropdown ──────────────────────────────────────────────────────

function TagDropdown({
    options,
    loading,
    filter,
    activeIndex,
    onSelect,
}: {
    options: TagOption[];
    loading: boolean;
    filter: string;
    activeIndex: number;
    onSelect: (opt: TagOption) => void;
}) {
    const styles = useStyles();
    const filtered = filter
        ? options.filter(o =>
            o.label.toLowerCase().includes(filter.toLowerCase()) ||
            o.group.toLowerCase().includes(filter.toLowerCase()))
        : options;

    const grouped = filtered.reduce<Record<string, TagOption[]>>((acc, o) => {
        (acc[o.group] ??= []).push(o);
        return acc;
    }, {});

    if (loading) {
        return (
            <div className={styles.dropdownWrap} style={{ padding: "12px", display: "flex", alignItems: "center", gap: "8px" }}>
                <Spinner size="tiny" /><Text size={200}>Loading workflows…</Text>
            </div>
        );
    }

    if (!filtered.length) {
        return (
            <div className={styles.dropdownWrap} style={{ padding: "10px 14px" }}>
                <Text size={200} style={{ color: tokens.colorNeutralForeground3 }}>No matches</Text>
            </div>
        );
    }

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
                                onMouseDown={(e) => { e.preventDefault(); onSelect(opt); }}
                            >
                                <Text size={200} weight="semibold">{opt.label}</Text>
                                <Text size={100} style={{ color: tokens.colorNeutralForeground3 }}>{opt.type}</Text>
                            </div>
                        );
                    })}
                </div>
            ))}
        </div>
    );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function CopilotChat() {
    const copilot = useCopilot();
    const styles = useStyles();
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    const [input, setInput] = useState("");
    const [pendingTags, setPendingTags] = useState<ChatTag[]>([]);
    const [showTagDropdown, setShowTagDropdown] = useState(false);
    const [tagFilter, setTagFilter] = useState("");
    const [tagActiveIdx, setTagActiveIdx] = useState(0);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [copilot.messages, copilot.loading]);

    useEffect(() => {
        if (copilot.open && copilot.tagOptions.length === 0) {
            copilot.loadTagOptions();
        }
    }, [copilot.open]); // eslint-disable-line react-hooks/exhaustive-deps

    const filteredOptions = tagFilter
        ? copilot.tagOptions.filter(o =>
            o.label.toLowerCase().includes(tagFilter.toLowerCase()) ||
            o.group.toLowerCase().includes(tagFilter.toLowerCase()))
        : copilot.tagOptions;

    const handleInputChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
        const val = e.target.value;
        setInput(val);
        const el = e.target;
        el.style.height = "auto";
        el.style.height = Math.min(el.scrollHeight, 120) + "px";

        const lastSlash = val.lastIndexOf("/");
        if (lastSlash !== -1 && (lastSlash === 0 || val[lastSlash - 1] === " " || val[lastSlash - 1] === "\n")) {
            setTagFilter(val.slice(lastSlash + 1));
            setShowTagDropdown(true);
            setTagActiveIdx(0);
        } else {
            setShowTagDropdown(false);
        }
    }, []);

    const commitTag = useCallback((opt: TagOption) => {
        setPendingTags(prev => [...prev, { type: opt.type, label: opt.label, value: opt.value }]);
        setInput(prev => {
            const lastSlash = prev.lastIndexOf("/");
            return lastSlash !== -1 ? prev.slice(0, lastSlash) : prev;
        });
        setShowTagDropdown(false);
        setTagFilter("");
        textareaRef.current?.focus();
    }, []);

    const removeTag = useCallback((idx: number) => {
        setPendingTags(prev => prev.filter((_, i) => i !== idx));
    }, []);

    const handleSend = useCallback(async () => {
        const text = input.trim();
        if (!text || copilot.loading) return;
        setInput("");
        setPendingTags([]);
        setShowTagDropdown(false);
        if (textareaRef.current) textareaRef.current.style.height = "auto";
        await copilot.sendMessage(text, pendingTags.length ? pendingTags : undefined);
    }, [input, pendingTags, copilot]);

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
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    }, [showTagDropdown, filteredOptions, tagActiveIdx, commitTag, handleSend]);

    const isFullscreen = copilot.fullscreen;

    // suppress unused import warning — ReactNode used by MarkdownContent above
    void (null as unknown as ReactNode);

    return (
        <>
            {copilot.open && isFullscreen && (
                <div className={styles.backdrop} onClick={copilot.close} />
            )}

            {copilot.open && (
                <div className={mergeClasses(styles.panel, isFullscreen ? styles.panelFullscreen : styles.panelNormal)}>

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
                            <Button
                                appearance="transparent"
                                icon={isFullscreen ? <ArrowMinimize20Regular /> : <ArrowMaximize20Regular />}
                                onClick={copilot.toggleFullscreen}
                                style={{ color: "white", minWidth: "unset" }}
                                aria-label={isFullscreen ? "Minimize" : "Fullscreen"}
                            />
                            <Button
                                appearance="transparent"
                                icon={<Dismiss20Regular />}
                                onClick={copilot.close}
                                style={{ color: "white", minWidth: "unset" }}
                                aria-label="Close"
                            />
                        </div>
                    </div>

                    <div className={styles.messages}>
                        {copilot.messages.length === 0 ? (
                            <div className={styles.welcomeWrap}>
                                <img src={copilotIcon} alt="" className={styles.welcomeIcon} />
                                <Text weight="semibold" size={400}>How can I help you?</Text>
                                <Text size={200} style={{ color: tokens.colorNeutralForeground3, textAlign: "center" }}>
                                    Ask me about testing your processes. Type <strong>/</strong> to tag a workflow.
                                </Text>
                                <div className={styles.topicsGrid}>
                                    {SUGGESTED_TOPICS.map(t => (
                                        <button
                                            key={t.label}
                                            className={styles.topicBtn}
                                            onClick={() => copilot.sendMessage(t.label)}
                                        >
                                            <span style={{ fontSize: "16px", display: "block", marginBottom: "2px" }}>{t.icon}</span>
                                            <Text size={200}>{t.label}</Text>
                                        </button>
                                    ))}
                                </div>
                            </div>
                        ) : (
                            copilot.messages.map((msg, i) => (
                                <div
                                    key={i}
                                    className={mergeClasses(styles.bubble, msg.role === "user" ? styles.userBubble : styles.agentBubble)}
                                >
                                    {msg.tags && msg.tags.length > 0 && (
                                        <div className={styles.tagsRow}>
                                            {msg.tags.map((tag, ti) => (
                                                <span key={ti} className={styles.tag}>
                                                    <Tag20Regular style={{ width: "10px", height: "10px" }} />
                                                    {tag.label}
                                                </span>
                                            ))}
                                        </div>
                                    )}
                                    {msg.role === "agent"
                                        ? <MarkdownContent content={msg.text} />
                                        : <Text size={300}>{msg.text}</Text>
                                    }
                                </div>
                            ))
                        )}
                        {copilot.loading && (
                            <div className={styles.agentBubble} style={{ alignSelf: "flex-start", padding: "10px 14px", borderRadius: tokens.borderRadiusMedium }}>
                                <Spinner size="tiny" />
                            </div>
                        )}
                        <div ref={messagesEndRef} />
                    </div>

                    {copilot.error && (
                        <Text className={styles.error}>{copilot.error}</Text>
                    )}

                    <div className={styles.inputArea}>
                        {pendingTags.length > 0 && (
                            <div className={styles.pendingTagsRow}>
                                {pendingTags.map((tag, i) => (
                                    <span
                                        key={i}
                                        className={styles.pendingTag}
                                        onClick={() => removeTag(i)}
                                        title="Click to remove"
                                    >
                                        <Tag20Regular style={{ width: "10px", height: "10px" }} />
                                        {tag.label} ×
                                    </span>
                                ))}
                            </div>
                        )}

                        <div style={{ position: "relative" }}>
                            {showTagDropdown && (
                                <TagDropdown
                                    options={copilot.tagOptions}
                                    loading={copilot.tagOptionsLoading}
                                    filter={tagFilter}
                                    activeIndex={tagActiveIdx}
                                    onSelect={commitTag}
                                />
                            )}
                        </div>

                        <div className={styles.inputRow}>
                            <textarea
                                ref={textareaRef}
                                className={styles.textarea}
                                placeholder='Message… (type "/" to tag a workflow)'
                                value={input}
                                onChange={handleInputChange}
                                onKeyDown={handleKeyDown}
                                disabled={copilot.loading}
                                rows={1}
                            />
                            <Button
                                appearance="primary"
                                icon={<Send20Regular />}
                                onClick={handleSend}
                                disabled={!input.trim() || copilot.loading}
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
