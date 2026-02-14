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
    ChevronRightRegular,
    ChevronDownRegular,
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
});

// ─── Result icon ─────────────────────────────────────────────────────────────

function ResultIcon({ result }: { result?: TestRunResult }) {
    if (!result) return <CircleRegular fontSize={16} />;
    if (result.passed) return <CheckmarkCircleFilled fontSize={16} color={tokens.colorPaletteGreenForeground1} />;
    return <DismissCircleFilled fontSize={16} color={tokens.colorPaletteRedForeground1} />;
}

// ─── Recursive tree renderer ─────────────────────────────────────────────────

function TestTreeItem({
    node,
    results,
    expanded,
    selected,
    onToggle,
    onSelect,
    onRun,
    onOpen,
}: {
    node: TestTreeNode;
    results: Map<string, TestRunResult>;
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
    const result = node.method ? results.get(node.fullPath) : undefined;
    const isSelected = selected === node.fullPath;

    const expandIcon = hasChildren
        ? isExpanded
            ? <ChevronDownRegular fontSize={12} />
            : <ChevronRightRegular fontSize={12} />
        : undefined;

    return (
        <TreeItem
            itemType={hasChildren ? "branch" : "leaf"}
            open={isExpanded}
            value={node.fullPath}
        >
            <TreeItemLayout
                iconBefore={expandIcon}
                iconAfter={<ResultIcon result={result} />}
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
                <Text size={200} title={node.fullPath}>{node.label}</Text>
            </TreeItemLayout>

            {result && !result.passed && isSelected && (
                <div className={styles.errorDetail}>
                    {result.errorMessage}
                    {result.trace && <pre className={styles.errorTrace}>{result.trace}</pre>}
                </div>
            )}

            {hasChildren && isExpanded && (
                <Tree>
                    {node.children.map((child) => (
                        <TestTreeItem
                            key={child.fullPath}
                            node={child}
                            results={results}
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
            <div className={styles.header}>
                <Text weight="semibold" size={200}>Test Explorer</Text>
                <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: "4px" }}>
                    {tests.running && <Spinner size="tiny" />}
                    <Button
                        appearance="primary"
                        size="small"
                        icon={<PlayFilled />}
                        onClick={() => tests.runAll()}
                        disabled={tests.running}
                    >
                        Run All
                    </Button>
                </div>
            </div>

            <div className={styles.searchWrap}>
                <SearchBox
                    placeholder="Search tests..."
                    value={search}
                    onChange={handleSearchChange}
                    size="small"
                />
            </div>

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
        </div>
    );
}
