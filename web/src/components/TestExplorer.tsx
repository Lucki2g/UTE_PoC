import { useEffect, useState, useMemo, useCallback, useRef } from "react";
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
    Tooltip,
    makeStyles,
    tokens,
    type SearchBoxProps,
} from "@fluentui/react-components";
import {
    PlayFilled,
    CheckmarkCircleFilled,
    DismissCircleFilled,
    CircleRegular,
    BeakerEditRegular,
    FolderRegular,
} from "@fluentui/react-icons";
import { useTests } from "../hooks/useTests.ts";
import { useBuilderContext } from "../contexts/BuilderContext.tsx";
import { loadDslToDiagram } from "../util/dslLoader.ts";
import type { TestMetadata, TestRunResult } from "../models/responses.ts";
import { UnsavedChangesDialog } from "./UnsavedChangesDialog.tsx";

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
        // Extract folder segments from filePath (e.g. "AccountTests/FooTests.cs" → ["AccountTests"])
        const normalizedPath = test.filePath.replace(/\\/g, "/");
        const pathSegments = normalizedPath.split("/");
        const folderParts = pathSegments.slice(0, -1); // everything except the filename

        let current = root;

        // Create folder nodes
        for (let i = 0; i < folderParts.length; i++) {
            const label = folderParts[i];
            const fullPath = folderParts.slice(0, i + 1).join("/");
            let node = current.find((n) => n.label === label && !n.test);
            if (!node) {
                node = { label, fullPath, children: [] };
                current.push(node);
            }
            current = node.children;
        }

        // Create class node
        const classFullPath = folderParts.length > 0
            ? `${folderParts.join("/")}/${test.className}`
            : test.className;
        let classNode = current.find((n) => n.label === test.className);
        if (!classNode) {
            classNode = { label: test.className, fullPath: classFullPath, children: [], test };
            current.push(classNode);
        } else {
            classNode.test = test;
        }

        // Add method nodes
        for (const method of test.methodNames) {
            classNode.children.push({
                label: method,
                fullPath: `${test.className}.${method}`,
                children: [],
                method,
                test,
            });
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
        overflowX: "hidden",
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
    treeItemLayout: {
        overflow: "hidden",
        // The main content span inside TreeItemLayout must also constrain
        "& .fui-TreeItemLayout__main": {
            overflow: "hidden",
            minWidth: 0,
            flex: 1,
        },
    },
    nodeRow: {
        display: "flex",
        alignItems: "center",
        overflow: "hidden",
        minWidth: 0,
    },
    nodeLabel: {
        overflow: "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap",
        minWidth: 0,
        flex: 1,
        display: "block",
    },
    actionButtons: {
        display: "flex",
        marginLeft: "auto",
        flexShrink: 0,
        gap: "2px",
    },
    results: {
        borderTop: `1px solid ${tokens.colorNeutralStroke2}`,
        padding: tokens.spacingHorizontalS,
        minHeight: "80px",
        maxHeight: "200px",
        overflowY: "auto",
        overflowX: "hidden",
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

type AggregateStatus = "none" | "running" | "skipped" | "failed" | "passed";

function getAggregateStatus(
    node: TestTreeNode,
    results: Map<string, TestRunResult>,
    runningTests: Set<string>,
): AggregateStatus {
    if (node.method) {
        if (runningTests.has(node.fullPath)) return "running";
        const r = results.get(node.fullPath);
        if (!r) return "none";
        return r.passed ? "passed" : "failed";
    }
    const childStatuses = node.children.map((c) => getAggregateStatus(c, results, runningTests));
    if (childStatuses.some((s) => s === "running")) return "running";
    // "none" on a child that has no result yet means it was skipped / not run
    if (childStatuses.some((s) => s === "none")) return "skipped";
    if (childStatuses.some((s) => s === "failed")) return "failed";
    if (childStatuses.every((s) => s === "passed")) return "passed";
    return "none";
}

function ResultIcon({ status }: { status: AggregateStatus }) {
    switch (status) {
        case "running": return <Spinner size="extra-tiny" />;
        case "passed": return <CheckmarkCircleFilled fontSize={16} color={tokens.colorPaletteGreenForeground1} />;
        case "failed": return <DismissCircleFilled fontSize={16} color={tokens.colorPaletteRedForeground1} />;
        default: return <CircleRegular fontSize={16} />;
    }
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
    const isFolder = !node.test && !node.method;
    const status = getAggregateStatus(node, results, runningTests);
    const isSelected = selected === node.fullPath;

    return (
        <TreeItem
            itemType={hasChildren ? "branch" : "leaf"}
            open={isExpanded}
            value={node.fullPath}
        >
            <TreeItemLayout
                className={styles.treeItemLayout}
                iconBefore={isFolder ? <FolderRegular fontSize={16} /> : <ResultIcon status={status} />}
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
                }}
            >
                <div className={styles.nodeRow}>
                    <Tooltip content={node.fullPath} relationship="label" withArrow>
                        <Text size={200} className={styles.nodeLabel}>{node.label}{hasChildren ? ` [${node.children.length}]` : ""}</Text>
                    </Tooltip>
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
                                disabled={status === "running"}
                                title="Run test"
                            />
                        )}
                        {isMethod && node.test && (
                            <Button
                                appearance="subtle"
                                size="small"
                                icon={<BeakerEditRegular className={styles.openIcon} />}
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
    const { state: builderState, dispatch: builderDispatch } = useBuilderContext();
    const styles = useStyles();
    const [search, setSearch] = useState("");
    const [expanded, setExpanded] = useState<Set<string>>(new Set());
    const [unsavedWarningOpen, setUnsavedWarningOpen] = useState(false);
    const pendingTestRef = useRef<TestMetadata | null>(null);

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

    const openTestDiagram = useCallback((test: TestMetadata) => {
        if (test.dsl) {
            const diagram = loadDslToDiagram(test.dsl, test.className);
            builderDispatch({ type: "SET_DIAGRAM", payload: diagram });
        }
    }, [builderDispatch]);

    const handleOpenTest = useCallback((test: TestMetadata) => {
        if (builderState.dirty) {
            pendingTestRef.current = test;
            setUnsavedWarningOpen(true);
        } else {
            openTestDiagram(test);
        }
    }, [builderState.dirty, openTestDiagram]);

    const handleConfirmDiscard = useCallback(() => {
        setUnsavedWarningOpen(false);
        if (pendingTestRef.current) {
            openTestDiagram(pendingTestRef.current);
            pendingTestRef.current = null;
        }
    }, [openTestDiagram]);

    const handleCancelDiscard = useCallback(() => {
        setUnsavedWarningOpen(false);
        pendingTestRef.current = null;
    }, []);

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

            <UnsavedChangesDialog
                open={unsavedWarningOpen}
                onDiscard={handleConfirmDiscard}
                onCancel={handleCancelDiscard}
                message="You have unsaved changes in the current test case. Loading another test will discard them."
                discardLabel="Discard & Open"
            />
        </div>
    );
}
