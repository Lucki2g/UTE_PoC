import { useEffect, useState, useMemo, useCallback } from "react";
import {
    Text,
    Button,
    SearchBox,
    Spinner,
    MessageBar,
    MessageBarBody,
    MessageBarActions,
    Tree,
    TreeItem,
    TreeItemLayout,
    makeStyles,
    tokens,
    type SearchBoxProps,
} from "@fluentui/react-components";
import {
    PlayFilled,
    CheckmarkCircleFilled,
    DismissCircleFilled,
    CircleRegular,
    DocumentFlowchartRegular,
} from "@fluentui/react-icons";
import { useTests } from "../hooks/useTests.ts";
import { useBuilderContext } from "../contexts/BuilderContext.tsx";
import { loadDslToDiagram } from "../util/dslLoader.ts";
import type { TestMetadata, TestRunResult } from "../models/responses.ts";

// ─── Tree node structure ─────────────────────────────────────────────────────

interface TestTreeNode {
    label: string;
    fullPath: string;
    children: TestTreeNode[];
    test?: TestMetadata;
    method?: string;
}

function buildTree(tests: TestMetadata[]): TestTreeNode[] {
    const root: TestTreeNode[] = [];

    for (const test of tests) {
        const parts = test.className.split(".");
        let current = root;

        for (let i = 0; i < parts.length; i++) {
            const label = parts[i];
            const fullPath = parts.slice(0, i + 1).join(".");
            let node = current.find((n) => n.label === label);
            if (!node) {
                node = { label, fullPath, children: [] };
                current.push(node);
            }
            if (i === parts.length - 1) {
                node.test = test;
                for (const method of test.methodNames) {
                    node.children.push({
                        label: method,
                        fullPath: `${test.className}.${method}`,
                        children: [],
                        method,
                        test,
                    });
                }
            }
            current = node.children;
        }
    }

    return root;
}

function filterTree(nodes: TestTreeNode[], query: string): TestTreeNode[] {
    if (!query) return nodes;
    const lower = query.toLowerCase();
    return nodes.reduce<TestTreeNode[]>((acc, node) => {
        const filteredChildren = filterTree(node.children, query);
        if (node.fullPath.toLowerCase().includes(lower) || filteredChildren.length > 0) {
            acc.push({ ...node, children: filteredChildren });
        }
        return acc;
    }, []);
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const useStyles = makeStyles({
    pane: {
        width: "300px",
        minWidth: "300px",
        borderRight: `1px solid ${tokens.colorNeutralStroke2}`,
        backgroundColor: tokens.colorNeutralBackground2,
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
    },
    header: {
        height: "40px",
        minHeight: "40px",
        display: "flex",
        alignItems: "center",
        paddingLeft: tokens.spacingHorizontalM,
        paddingRight: tokens.spacingHorizontalS,
        borderBottom: `1px solid ${tokens.colorNeutralStroke2}`,
        gap: tokens.spacingHorizontalS,
    },
    searchWrap: {
        padding: tokens.spacingHorizontalS,
    },
    content: {
        flex: 1,
        overflowY: "auto",
        padding: tokens.spacingHorizontalS,
    },
    errorDetail: {
        padding: tokens.spacingHorizontalS,
        marginTop: tokens.spacingVerticalXS,
        backgroundColor: tokens.colorPaletteRedBackground1,
        borderRadius: tokens.borderRadiusMedium,
        fontSize: tokens.fontSizeBase200,
        color: tokens.colorPaletteRedForeground1,
    },
    errorTrace: {
        marginTop: tokens.spacingVerticalXS,
        fontSize: tokens.fontSizeBase100,
        whiteSpace: "pre-wrap",
        wordBreak: "break-all",
        color: tokens.colorNeutralForeground3,
    },
    empty: {
        padding: tokens.spacingHorizontalM,
        textAlign: "center" as const,
    },
    playIcon: {
        color: tokens.colorPaletteGreenBackground3,
    },
    openIcon: {
        color: tokens.colorNeutralForeground2,
    },
    actionButtons: {
        display: "flex",
        marginLeft: "auto",
        gap: "2px",
    },
    results: {
        borderTop: `1px solid ${tokens.colorNeutralStroke2}`,
        padding: tokens.spacingHorizontalS,
        minHeight: "80px",
        maxHeight: "200px",
        overflowY: "auto",
    },
    resultHeader: {
        fontWeight: tokens.fontWeightSemibold,
        marginBottom: tokens.spacingVerticalXS,
    },
    resultSummary: {
        display: "flex",
        gap: tokens.spacingHorizontalM,
        marginBottom: tokens.spacingVerticalXS,
    },
    resultMessage: {
        marginTop: tokens.spacingVerticalXS,
        fontSize: tokens.fontSizeBase200,
        color: tokens.colorPaletteRedForeground1,
    },
    resultTrace: {
        marginTop: tokens.spacingVerticalXS,
        fontSize: tokens.fontSizeBase100,
        whiteSpace: "pre-wrap",
        wordBreak: "break-all",
        color: tokens.colorNeutralForeground3,
        maxHeight: "100px",
        overflowY: "auto",
    },
});

// ─── Result icon ─────────────────────────────────────────────────────────────

function ResultIcon({ result, running }: { result?: TestRunResult; running?: boolean }) {
    if (running) return <Spinner size="extra-tiny" />;
    if (!result) return <CircleRegular fontSize={16} />;
    if (result.passed) return <CheckmarkCircleFilled fontSize={16} color={tokens.colorPaletteGreenForeground1} />;
    return <DismissCircleFilled fontSize={16} color={tokens.colorPaletteRedForeground1} />;
}

// ─── Recursive tree renderer ─────────────────────────────────────────────────

function TestTreeItem({
    node,
    results,
    runningTests,
    expanded,
    selected,
    onToggle,
    onSelect,
    onRun,
    onOpen,
}: {
    node: TestTreeNode;
    results: Map<string, TestRunResult>;
    runningTests: Set<string>;
    expanded: Set<string>;
    selected: string | null;
    onToggle: (path: string) => void;
    onSelect: (path: string) => void;
    onRun: (testName: string) => void;
    onOpen: (test: TestMetadata) => void;
}) {
    const styles = useStyles();
    const isExpanded = expanded.has(node.fullPath);
    const hasChildren = node.children.length > 0;
    const isMethod = !!node.method;
    const result = isMethod ? results.get(node.fullPath) : undefined;
    const isRunning = isMethod && runningTests.has(node.fullPath);
    const isSelected = selected === node.fullPath;

    return (
        <TreeItem
            itemType={hasChildren ? "branch" : "leaf"}
            open={isExpanded}
            value={node.fullPath}
        >
            <TreeItemLayout
                iconBefore={<ResultIcon result={result} running={isRunning} />}
                onClick={() => {
                    if (hasChildren) onToggle(node.fullPath);
                    onSelect(node.fullPath);
                }}
                onDoubleClick={() => {
                    if (node.method && node.test) {
                        onRun(`${node.test.className}.${node.method}`);
                    } else if (node.test) {
                        onOpen(node.test);
                    }
                }}
                style={{
                    backgroundColor: isSelected ? tokens.colorNeutralBackground1Selected : undefined,
                    borderRadius: tokens.borderRadiusMedium,
                    display: "flex",
                    alignItems: "center",
                    width: "100%",
                    gap: "4px",
                }}
            >
                <div style={{
                    display: "flex",
                    alignItems: "center",
                    width: "100%",
                }}>
                    <Text size={200} title={node.fullPath}>{node.label}{hasChildren ? ` [${node.children.length}]` : ""}</Text>
                    <div className={styles.actionButtons}>
                        {isMethod && node.test && (
                            <Button
                                appearance="subtle"
                                size="small"
                                icon={<PlayFilled className={styles.playIcon} />}
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onRun(`${node.test!.className}.${node.method!}`);
                                }}
                                disabled={isRunning}
                                title="Run test"
                            />
                        )}
                        {isMethod && node.test && (
                            <Button
                                appearance="subtle"
                                size="small"
                                icon={<DocumentFlowchartRegular className={styles.openIcon} />}
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onOpen(node.test!);
                                }}
                                title="Open in builder"
                            />
                        )}
                    </div>
                </div>
            </TreeItemLayout>

            {hasChildren && isExpanded && (
                <Tree>
                    {node.children.map((child) => (
                        <TestTreeItem
                            key={child.fullPath}
                            node={child}
                            results={results}
                            runningTests={runningTests}
                            expanded={expanded}
                            selected={selected}
                            onToggle={onToggle}
                            onSelect={onSelect}
                            onRun={onRun}
                            onOpen={onOpen}
                        />
                    ))}
                </Tree>
            )}
        </TreeItem>
    );
}

// ─── Tree lookup helpers ─────────────────────────────────────────────────────

function findNode(nodes: TestTreeNode[], path: string): TestTreeNode | undefined {
    for (const node of nodes) {
        if (node.fullPath === path) return node;
        const found = findNode(node.children, path);
        if (found) return found;
    }
    return undefined;
}

function collectMethodPaths(node: TestTreeNode): string[] {
    if (node.method) return [node.fullPath];
    return node.children.flatMap(collectMethodPaths);
}

// ─── Results Panel ───────────────────────────────────────────────────────────

function ResultsPanel({
    selectedPath,
    results,
    tree,
}: {
    selectedPath: string;
    results: Map<string, TestRunResult>;
    tree: TestTreeNode[];
}) {
    const styles = useStyles();
    const node = findNode(tree, selectedPath);
    if (!node) return null;

    // Single method selected — show its detail
    if (node.method) {
        const result = results.get(node.fullPath);
        if (!result) return null;
        return (
            <div className={styles.results}>
                <Text size={300} className={styles.resultHeader}>
                    {result.passed ? <CheckmarkCircleFilled color={tokens.colorPaletteGreenForeground1} /> : <DismissCircleFilled color={tokens.colorPaletteRedForeground1} />}
                    {" "}{node.label} — {result.duration}
                </Text>
                {!result.passed && result.errorMessage && (
                    <div className={styles.resultMessage}>{result.errorMessage}</div>
                )}
                {!result.passed && result.trace && (
                    <pre className={styles.resultTrace}>{result.trace}</pre>
                )}
            </div>
        );
    }

    // Branch selected — show summary of children
    const methodPaths = collectMethodPaths(node);
    const childResults = methodPaths.map((p) => results.get(p)).filter(Boolean) as TestRunResult[];
    if (childResults.length === 0) return null;

    const passed = childResults.filter((r) => r.passed).length;
    const failed = childResults.filter((r) => !r.passed).length;
    const notRun = methodPaths.length - childResults.length;

    return (
        <div className={styles.results}>
            <Text size={300} className={styles.resultHeader}>{node.label}</Text>
            <div className={styles.resultSummary}>
                <Text size={200}>
                    <CheckmarkCircleFilled color={tokens.colorPaletteGreenForeground1} /> {passed} passed
                </Text>
                <Text size={200}>
                    <DismissCircleFilled color={tokens.colorPaletteRedForeground1} /> {failed} failed
                </Text>
                {notRun > 0 && (
                    <Text size={200}>
                        <CircleRegular /> {notRun} not run
                    </Text>
                )}
            </div>
        </div>
    );
}

// ─── Main Component ──────────────────────────────────────────────────────────

export function TestExplorer() {
    const tests = useTests();
    const { dispatch: builderDispatch } = useBuilderContext();
    const styles = useStyles();
    const [search, setSearch] = useState("");
    const [expanded, setExpanded] = useState<Set<string>>(new Set());

    useEffect(() => {
        tests.fetchAll();
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    const tree = useMemo(() => buildTree(tests.tests), [tests.tests]);
    const filtered = useMemo(() => filterTree(tree, search), [tree, search]);

    const toggleExpand = (path: string) => {
        setExpanded((prev) => {
            const next = new Set(prev);
            if (next.has(path)) next.delete(path);
            else next.add(path);
            return next;
        });
    };

    const handleRun = (testName: string) => {
        tests.run({ testName });
    };

    const handleOpenTest = useCallback((test: TestMetadata) => {
        if (test.dsl) {
            const diagram = loadDslToDiagram(test.dsl, test.className);
            builderDispatch({ type: "SET_DIAGRAM", payload: diagram });
        }
    }, [builderDispatch]);

    const handleSearchChange: SearchBoxProps["onChange"] = (_ev, data) => {
        setSearch(data.value);
    };

    return (
        <div className={styles.pane}>

            {/* HEADER*/}
            <div className={styles.header}>
                <div className={styles.searchWrap}>
                    <SearchBox
                        placeholder="Search tests..."
                        value={search}
                        onChange={handleSearchChange}
                        size="small"
                    />
                </div>
                <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: "4px" }}>
                    {tests.runningTests.size > 0 && <Spinner size="tiny" />}
                    <Button
                        size="small"
                        icon={<PlayFilled className={styles.playIcon} />}
                        onClick={() => tests.runAll()}
                        disabled={tests.running}
                    />
                </div>
            </div>

            {/* ERROR MESSAGE */}
            {tests.error && (
                <MessageBar intent="error">
                    <MessageBarBody>{tests.error}</MessageBarBody>
                    <MessageBarActions>
                        <Button appearance="transparent" size="small" onClick={tests.clearError}>
                            Dismiss
                        </Button>
                    </MessageBarActions>
                </MessageBar>
            )}

            {/* TEST CASES */}
            <div className={styles.content}>
                {tests.loading ? (
                    <Spinner size="small" label="Loading tests..." />
                ) : (
                    <Tree aria-label="Test tree">
                        {filtered.map((node) => (
                            <TestTreeItem
                                key={node.fullPath}
                                node={node}
                                results={tests.results}
                                runningTests={tests.runningTests}
                                expanded={expanded}
                                selected={tests.selectedTest}
                                onToggle={toggleExpand}
                                onSelect={tests.selectTest}
                                onRun={handleRun}
                                onOpen={handleOpenTest}
                            />
                        ))}
                        {filtered.length === 0 && !tests.loading && (
                            <Text size={200} className={styles.empty}>
                                {tests.tests.length === 0 ? "No tests found" : "No matches"}
                            </Text>
                        )}
                    </Tree>
                )}
            </div>

            {/* RESULTS DETAIL PANEL */}
            {tests.selectedTest && (
                <ResultsPanel
                    selectedPath={tests.selectedTest}
                    results={tests.results}
                    tree={tree}
                />
            )}
        </div>
    );
}
