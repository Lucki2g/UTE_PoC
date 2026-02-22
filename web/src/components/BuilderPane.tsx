import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent } from "react";
import { UnsavedChangesDialog } from "./UnsavedChangesDialog.tsx";
import {
    Text,
    Button,
    Toolbar,
    ToolbarButton,
    Dialog,
    DialogTrigger,
    DialogSurface,
    DialogBody,
    DialogTitle,
    DialogContent,
    DialogActions,
    Input,
    Badge,
    Field,
    Checkbox,
    makeStyles,
    tokens,
} from "@fluentui/react-components";
import {
    AddRegular,
    SaveRegular,
    HexagonRegular,
    BeakerDismissRegular,
    BeakerEditRegular,
    BeakerSettingsRegular,
} from "@fluentui/react-icons";
import {
    ReactFlow,
    ReactFlowProvider,
    Background,
    Controls,
    Panel,
    useReactFlow,
    useNodesInitialized,
    addEdge,
    type Connection,
    type OnNodesChange,
    type OnEdgesChange,
    type Node,
    applyNodeChanges,
    applyEdgeChanges,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useBuilderContext } from "../contexts/BuilderContext.tsx";
import { useTests } from "../hooks/useTests.ts";
import { useGit } from "../hooks/useGit.ts";
import { generateDsl } from "../util/dslGenerator.ts";
import { ProducerNode } from "./nodes/producer/ProducerNode.tsx";
import { ServiceNode } from "./nodes/dao/ServiceNode.tsx";
import { AssertNode } from "./nodes/assert/AssertNode.tsx";
import { DropZoneNode, type DropZoneNodeData } from "./nodes/DropZoneNode.tsx";
import type {
    ProducerNodeData,
    ServiceNodeData,
    AssertNodeData,
    BuilderNode,
} from "../models/builder.ts";

const nodeTypes = {
    producer: ProducerNode,
    service: ServiceNode,
    assert: AssertNode,
    dropZone: DropZoneNode,
};

let nodeIdCounter = 0;
function nextId() {
    return `node_${++nodeIdCounter}_${Date.now()}`;
}

const NODE_X = 250;
const NODE_GAP = 80;
const DROP_ZONE_HEIGHT = 40;

const useStyles = makeStyles({
    pane: {
        flex: 1,
        minWidth: 0,
        backgroundColor: tokens.colorNeutralBackground3,
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
    canvas: {
        flex: 1,
        position: "relative" as const,
    },
    dirtyBadge: {
        marginLeft: tokens.spacingHorizontalXS,
        backgroundColor: tokens.colorPaletteDarkOrangeBackground3,
    },
});

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Sort nodes by their order index, falling back to Y position. */
function sortedByOrder(nodes: BuilderNode[]): BuilderNode[] {
    return [...nodes].sort((a, b) => {
        const orderA = (a.data as Record<string, unknown>)._orderIndex as number | undefined;
        const orderB = (b.data as Record<string, unknown>)._orderIndex as number | undefined;
        if (orderA != null && orderB != null) return orderA - orderB;
        return a.position.y - b.position.y;
    });
}

/** Create a BuilderNode from drop event data, positioned at (x, y). */
function createNodeFromDrop(
    type: string,
    rawData: string,
    x: number,
    y: number,
): BuilderNode | null {
    switch (type) {
        case "producer": {
            const producer = JSON.parse(rawData) as { entityName: string; draftId?: string };
            const data: ProducerNodeData = {
                nodeType: "producer",
                draftId: producer.draftId ?? producer.entityName,
                entityName: producer.entityName,
                variableName: producer.entityName.toLowerCase(),
                build: false,
                anonymous: false,
                withMutations: [],
            };
            return { id: nextId(), type: "producer", position: { x, y }, data };
        }
        case "assert": {
            const data: AssertNodeData = {
                nodeType: "assert",
                assertionKind: rawData || "notNull",
                targetVar: "",
                expectedValue: "",
            };
            return { id: nextId(), type: "assert", position: { x, y }, data };
        }
        case "where": {
            const data: ServiceNodeData = {
                nodeType: "service",
                operation: "RetrieveList",
                whereExpressions: [{ column: "", operator: "equals", value: "" }],
            };
            return { id: nextId(), type: "service", position: { x, y }, data };
        }
        case "with":
            // With blocks are dropped directly onto ProducerNodes, not onto the canvas
            return null;
        default:
            return null;
    }
}

// ─── Component ───────────────────────────────────────────────────────────────

function BuilderPaneInner() {
    const { state, dispatch } = useBuilderContext();
    const tests = useTests();
    const git = useGit();
    const styles = useStyles();
    const reactFlow = useReactFlow();
    const nodesInitialized = useNodesInitialized();

    const [newDialogOpen, setNewDialogOpen] = useState(false);
    const [newTestName, setNewTestName] = useState("");
    const [newClassName, setNewClassName] = useState("");
    const [newFolderName, setNewFolderName] = useState("");
    const [createBranch, setCreateBranch] = useState(false);
    const [newBranchName, setNewBranchName] = useState("");
    const [closeWarningOpen, setCloseWarningOpen] = useState(false);
    const [isDragging, setIsDragging] = useState(false);

    // Track the last layout signature to avoid redundant repositioning
    const lastLayoutSigRef = useRef("");

    // ─── Auto-layout: measure node heights and reposition ─────────────────────

    useEffect(() => {
        if (!nodesInitialized || state.nodes.length === 0) return;

        const sorted = sortedByOrder(state.nodes);

        // Build a signature from node ids + their measured heights to detect actual changes
        const heightEntries: { id: string; height: number }[] = [];
        for (const n of sorted) {
            const internal = reactFlow.getInternalNode(n.id);
            const h = internal?.measured?.height ?? 0;
            heightEntries.push({ id: n.id, height: h });
        }

        // If any node hasn't been measured yet, skip this layout pass
        if (heightEntries.some((e) => e.height === 0)) return;

        const sig = heightEntries.map((e) => `${e.id}:${e.height}`).join("|");
        if (sig === lastLayoutSigRef.current) return;
        lastLayoutSigRef.current = sig;

        // Compute new Y positions: stack nodes top-to-bottom with NODE_GAP between them
        // Also ensure every node has a stable _orderIndex
        let currentY = 0;
        let changed = false;
        const repositioned: BuilderNode[] = [];
        for (let i = 0; i < sorted.length; i++) {
            const node = sorted[i];
            const currentOrder = (node.data as Record<string, unknown>)._orderIndex;
            const needsUpdate =
                node.position.x !== NODE_X ||
                node.position.y !== currentY ||
                currentOrder !== i;
            if (needsUpdate) {
                changed = true;
                repositioned.push({
                    ...node,
                    position: { x: NODE_X, y: currentY },
                    data: { ...node.data, _orderIndex: i },
                });
            } else {
                repositioned.push(node);
            }
            currentY += heightEntries[i].height + NODE_GAP;
        }

        if (changed) {
            dispatch({ type: "SET_NODES", payload: repositioned });
        }
    }, [nodesInitialized, state.nodes, reactFlow, dispatch]);

    // ─── ReactFlow callbacks ─────────────────────────────────────────────────

    const onNodesChange: OnNodesChange<BuilderNode> = useCallback(
        (changes) => {
            // Filter out position changes — nodes are auto-laid-out and not user-moveable
            // Also filter out changes for drop zone nodes (they're transient, not in state)
            const filtered = changes.filter((c) => {
                if (c.type === "position") return false;
                if ("id" in c && typeof c.id === "string" && c.id.startsWith("dz_")) return false;
                return true;
            });
            if (filtered.length === 0) return;
            const updated = applyNodeChanges(filtered, state.nodes);
            dispatch({ type: "SET_NODES", payload: updated });

            // If dimensions changed, schedule a re-layout on next frame
            if (filtered.some((c) => c.type === "dimensions")) {
                lastLayoutSigRef.current = "";
            }
        },
        [dispatch, state.nodes],
    );

    const onEdgesChange: OnEdgesChange = useCallback(
        (changes) => {
            dispatch({ type: "SET_EDGES", payload: applyEdgeChanges(changes, state.edges) });
        },
        [dispatch, state.edges],
    );

    const onConnect = useCallback(
        (connection: Connection) => {
            dispatch({ type: "SET_EDGES", payload: addEdge(connection, state.edges) });
        },
        [dispatch, state.edges],
    );

    // ─── Drag tracking ───────────────────────────────────────────────────────
    // Use dragOver with a short timeout for reliable detection.
    // onDragEnter/onDragLeave are unreliable on nested ReactFlow DOM.
    const dragTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const isDraggingRef = useRef(false);

    const onDragOver = useCallback((e: DragEvent) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "copy";

        if (!state.testName) return;
        if (!e.dataTransfer.types.includes("application/testengine-type")) return;

        if (!isDraggingRef.current) {
            isDraggingRef.current = true;
            setIsDragging(true);
        }

        // Reset the timeout — if no dragOver fires for 150ms, drag left the canvas
        if (dragTimeoutRef.current) clearTimeout(dragTimeoutRef.current);
        dragTimeoutRef.current = setTimeout(() => {
            isDraggingRef.current = false;
            setIsDragging(false);
            dragTimeoutRef.current = null;
        }, 150);
    }, [state.testName]);

    // ─── Drop handling ───────────────────────────────────────────────────────

    /** Append node at the end of the diagram. */
    const appendNode = useCallback(
        (node: BuilderNode) => {
            const sorted = sortedByOrder(state.nodes);

            // Tag with order index so layout knows the insertion order
            const orderIndex = sorted.length;
            const tagged = { ...node, data: { ...node.data, _orderIndex: orderIndex } };

            const newNodes = [...state.nodes, tagged];
            let newEdges = state.edges;
            if (sorted.length > 0) {
                const lastNode = sorted[sorted.length - 1];
                newEdges = [...state.edges, {
                    id: `e_${lastNode.id}_${tagged.id}`,
                    source: lastNode.id,
                    target: tagged.id,
                }];
            }
            dispatch({ type: "SET_NODES_AND_EDGES", payload: { nodes: newNodes, edges: newEdges } });
        },
        [dispatch, state.nodes, state.edges],
    );

    /** Insert node at a specific index in the ordered node list. */
    const insertNodeAt = useCallback(
        (index: number, node: BuilderNode) => {
            const sorted = sortedByOrder(state.nodes);

            // If index is at the end, just append
            if (index >= sorted.length) {
                appendNode(node);
                return;
            }

            // Assign order indices: items before index keep theirs, new node gets index, rest shift up
            const updatedNodes = sorted.map((n, i) => {
                const orderIndex = i >= index ? i + 1 : i;
                return { ...n, data: { ...n.data, _orderIndex: orderIndex } };
            });
            const tagged = { ...node, data: { ...node.data, _orderIndex: index } };

            // Insert the new node
            const allNodes = [...updatedNodes.slice(0, index), tagged, ...updatedNodes.slice(index)];

            // Re-wire edges: remove old edge at insertion point, add two new ones
            const prev = index > 0 ? sorted[index - 1] : null;
            const next = sorted[index];

            let newEdges = [...state.edges];

            // Remove edge between prev and next if it exists
            if (prev && next) {
                newEdges = newEdges.filter(
                    (e) => !(e.source === prev.id && e.target === next.id),
                );
            }

            // Connect prev → new node
            if (prev) {
                newEdges.push({
                    id: `e_${prev.id}_${tagged.id}`,
                    source: prev.id,
                    target: tagged.id,
                });
            }

            // Connect new node → next
            if (next) {
                newEdges.push({
                    id: `e_${tagged.id}_${next.id}`,
                    source: tagged.id,
                    target: next.id,
                });
            }

            dispatch({ type: "SET_NODES_AND_EDGES", payload: { nodes: allNodes, edges: newEdges } });
        },
        [dispatch, state.nodes, state.edges, appendNode],
    );

    /** Determine insertion index from the drop Y position in flow coordinates. */
    const getInsertionIndex = useCallback(
        (flowY: number): number => {
            const sorted = sortedByOrder(state.nodes);
            if (sorted.length === 0) return 0;

            // Read measured heights
            const heights: number[] = sorted.map((n) => {
                const internal = reactFlow.getInternalNode(n.id);
                return internal?.measured?.height ?? 80;
            });

            // Find which gap the drop Y falls into
            // Each node occupies [node.position.y, node.position.y + height]
            // The midpoint between two nodes defines the boundary
            for (let i = 0; i < sorted.length; i++) {
                const nodeBottom = sorted[i].position.y + heights[i];
                const nextTop = i < sorted.length - 1 ? sorted[i + 1].position.y : Infinity;
                const boundary = (nodeBottom + nextTop) / 2;

                // If drop is above this node's midpoint, insert before it
                if (i === 0) {
                    const nodeMiddle = sorted[0].position.y + heights[0] / 2;
                    if (flowY < nodeMiddle) return 0;
                }

                // If drop is between this node and the next
                if (flowY < boundary) return i + 1;
            }

            return sorted.length;
        },
        [state.nodes, reactFlow],
    );

    /** Handle drop on the canvas — determines insertion position from Y coordinate. */
    const onDrop = useCallback(
        (e: DragEvent) => {
            e.preventDefault();
            isDraggingRef.current = false;
            setIsDragging(false);
            if (dragTimeoutRef.current) { clearTimeout(dragTimeoutRef.current); dragTimeoutRef.current = null; }

            if (!state.testName) return;

            const type = e.dataTransfer.getData("application/testengine-type");
            const rawData = e.dataTransfer.getData("application/testengine-data");
            if (!type) return;

            const node = createNodeFromDrop(type, rawData, NODE_X, 0);
            if (!node) return;

            // Convert screen position to flow position to determine insertion index
            const flowPos = reactFlow.screenToFlowPosition({ x: e.clientX, y: e.clientY });
            const index = getInsertionIndex(flowPos.y);
            const sorted = sortedByOrder(state.nodes);

            if (index >= sorted.length) {
                appendNode(node);
            } else {
                insertNodeAt(index, node);
            }
        },
        [state.testName, state.nodes, reactFlow, appendNode, insertNodeAt, getInsertionIndex],
    );

    // ─── Drop zone nodes ─────────────────────────────────────────────────────

    const dropZoneNodes = useMemo((): Node[] => {
        if (!isDragging || state.nodes.length === 0) return [];

        const sorted = sortedByOrder(state.nodes);
        const zones: Node[] = [];

        // Read measured heights from ReactFlow internals
        const heights: number[] = sorted.map((n) => {
            const internal = reactFlow.getInternalNode(n.id);
            return internal?.measured?.height ?? 80;
        });

        // Zone above first node
        zones.push({
            id: "dz_0",
            type: "dropZone",
            position: {
                x: NODE_X,
                y: sorted[0].position.y - NODE_GAP / 2 - DROP_ZONE_HEIGHT,
            },
            data: { nodeType: "dropZone", insertionIndex: 0 } satisfies DropZoneNodeData,
            selectable: false,
            draggable: false,
        });

        // Zones between consecutive nodes
        for (let i = 0; i < sorted.length - 1; i++) {
            const bottomOfCurrent = sorted[i].position.y + heights[i];
            const topOfNext = sorted[i + 1].position.y;
            const midY = (bottomOfCurrent + topOfNext) / 2;
            zones.push({
                id: `dz_${i + 1}`,
                type: "dropZone",
                position: { x: NODE_X, y: midY - DROP_ZONE_HEIGHT / 2 },
                data: { nodeType: "dropZone", insertionIndex: i + 1 } satisfies DropZoneNodeData,
                selectable: false,
                draggable: false,
            });
        }

        // Zone below last node
        const lastIdx = sorted.length - 1;
        zones.push({
            id: `dz_${sorted.length}`,
            type: "dropZone",
            position: {
                x: NODE_X,
                y: sorted[lastIdx].position.y + heights[lastIdx] + NODE_GAP / 2,
            },
            data: { nodeType: "dropZone", insertionIndex: sorted.length } satisfies DropZoneNodeData,
            selectable: false,
            draggable: false,
        });

        return zones;
    }, [isDragging, state.nodes, reactFlow]);

    const displayNodes = useMemo(
        () => [...state.nodes, ...dropZoneNodes] as BuilderNode[],
        [state.nodes, dropZoneNodes],
    );

    // ─── Save / Close handlers ───────────────────────────────────────────────

    const persistTest = useCallback(async () => {
        if (!state.testName) return;
        const dsl = generateDsl(state.nodes, state.testName);
        if (state.isNew) {
            await tests.create({
                code: dsl,
                className: state.testClassName ?? undefined,
                folder: state.folderName ?? undefined,
            });
            dispatch({ type: "MARK_PERSISTED", payload: state.testClassName ?? state.testName });
        } else {
            await tests.update({ className: state.testClassName!, code: dsl });
        }
        dispatch({ type: "MARK_CLEAN" });
    }, [state, tests, dispatch]);

    const handleSave = useCallback(async () => {
        await persistTest();
    }, [persistTest]);

    const handleSaveAndPublish = useCallback(async () => {
        await persistTest();
    }, [persistTest]);

    const handleClose = useCallback(() => {
        if (state.dirty) {
            setCloseWarningOpen(true);
            return;
        }
        dispatch({ type: "CLEAR" });
    }, [state.dirty, dispatch]);

    const handleConfirmClose = useCallback(() => {
        setCloseWarningOpen(false);
        dispatch({ type: "CLEAR" });
    }, [dispatch]);

    const handleCreateNew = useCallback(async () => {
        const name = newTestName.trim();
        if (!name) return;

        if (createBranch && newBranchName.trim()) {
            await git.createBranch({ branchName: newBranchName.trim() });
        }

        dispatch({ type: "CLEAR" });
        dispatch({
            type: "SET_DIAGRAM",
            payload: {
                nodes: [],
                edges: [],
                testName: name,
                testClassName: newClassName.trim() || null,
                folderName: newFolderName.trim() || null,
                dirty: false,
                isNew: true,
            },
        });
        setNewDialogOpen(false);
        setNewTestName("");
        setNewClassName("");
        setNewFolderName("");
        setCreateBranch(false);
        setNewBranchName("");
    }, [dispatch, newTestName, newClassName, newFolderName, createBranch, newBranchName, git]);

    const isEmpty = state.nodes.length === 0;
    const hasTestOpen = !!state.testName;

    // ─── Render ──────────────────────────────────────────────────────────────

    return (
        <div className={styles.pane}>
            <div className={styles.header}>
                <Text weight="semibold" size={200}>Visual Test Builder</Text>
                {state.testName && (
                    <Text size={100} style={{ color: tokens.colorNeutralForeground3 }}>
                        — {state.testName}
                    </Text>
                )}
                <Toolbar style={{ marginLeft: "auto" }}>
                    {!hasTestOpen && (
                        <Dialog open={newDialogOpen} onOpenChange={(_e, data) => setNewDialogOpen(data.open)}>
                            <DialogTrigger disableButtonEnhancement>
                                <ToolbarButton icon={<AddRegular />}>
                                    New
                                </ToolbarButton>
                            </DialogTrigger>
                            <DialogSurface>
                                <DialogBody>
                                    <DialogTitle>New Test Case</DialogTitle>
                                    <DialogContent style={{ display: "flex", flexDirection: "column", gap: tokens.spacingVerticalM }}>
                                        <Field label="Test method name" required>
                                            <Input
                                                placeholder="e.g. EnsureNameIsCorrect"
                                                value={newTestName}
                                                onChange={(_ev, data) => setNewTestName(data.value)}
                                                onKeyDown={(e) => { if (e.key === "Enter") handleCreateNew(); }}
                                            />
                                        </Field>
                                        <Field label="Test class name">
                                            <Input
                                                placeholder="e.g. EnsureNameIsCorrectTests"
                                                value={newClassName}
                                                onChange={(_ev, data) => setNewClassName(data.value)}
                                            />
                                        </Field>
                                        <Field label="Folder">
                                            <Input
                                                placeholder="e.g. AccountTests"
                                                value={newFolderName}
                                                onChange={(_ev, data) => setNewFolderName(data.value)}
                                            />
                                        </Field>
                                        <Checkbox
                                            label="Create a new branch"
                                            checked={createBranch}
                                            onChange={(_ev, data) => setCreateBranch(!!data.checked)}
                                        />
                                        {createBranch && (
                                            <Field label="Branch name">
                                                <Input
                                                    placeholder="e.g. feature/account-tests"
                                                    value={newBranchName}
                                                    onChange={(_ev, data) => setNewBranchName(data.value)}
                                                />
                                            </Field>
                                        )}
                                    </DialogContent>
                                    <DialogActions>
                                        <DialogTrigger disableButtonEnhancement>
                                            <Button appearance="secondary">Cancel</Button>
                                        </DialogTrigger>
                                        <Button
                                            appearance="primary"
                                            onClick={handleCreateNew}
                                            disabled={!newTestName.trim() || (createBranch && !newBranchName.trim())}
                                        >
                                            Create
                                        </Button>
                                    </DialogActions>
                                </DialogBody>
                            </DialogSurface>
                        </Dialog>
                    )}
                    {hasTestOpen && (
                        <div style={{ display: "flex", gap: tokens.spacingHorizontalS }}>
                            <Button
                                appearance="subtle"
                                size="small"
                                icon={<SaveRegular />}
                                onClick={handleSave}
                                disabled={!state.dirty}
                            >
                                Save
                            </Button>
                            <Button
                                appearance="primary"
                                size="small"
                                icon={<BeakerEditRegular />}
                                onClick={handleSaveAndPublish}
                                disabled={!state.dirty}
                            >
                                Save & Publish
                            </Button>
                            <Button
                                appearance="secondary"
                                size="small"
                                icon={<BeakerDismissRegular />}
                                onClick={handleClose}
                                disabled={!state.dirty}
                            >
                                Close
                            </Button>
                        </div>
                    )}
                </Toolbar>
            </div>

            <div
                className={styles.canvas}
                onDragOver={onDragOver}
                onDrop={onDrop}
            >
                <ReactFlow
                    nodes={displayNodes}
                    edges={state.edges}
                    onNodesChange={onNodesChange}
                    onEdgesChange={onEdgesChange}
                    onConnect={onConnect}
                    nodeTypes={nodeTypes}
                    nodesDraggable={false}
                    fitView
                    proOptions={{ hideAttribution: true }}
                >
                    <Background />
                    <Controls />
                    {isEmpty && !isDragging && (
                        <Panel position="top-center" style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", gap: tokens.spacingVerticalM, pointerEvents: "none" }}>
                            <HexagonRegular fontSize={48} style={{ opacity: 0.2 }} />
                            <Text size={300} style={{ color: tokens.colorNeutralForeground4 }}>
                                Select a test or drag components to begin
                            </Text>
                            <Text size={200} style={{ color: tokens.colorNeutralForeground4 }}>
                                Drag DataProducers, Services, and Asserts from the right panel
                            </Text>
                        </Panel>
                    )}
                    {state.dirty && (
                        <div style={{ position: "absolute", top: tokens.spacingVerticalM, right: tokens.spacingHorizontalM }}>
                            <Badge icon={<BeakerSettingsRegular />} size="medium" className={styles.dirtyBadge}>
                                Unsaved Changes
                            </Badge>
                        </div>
                    )}
                </ReactFlow>
            </div>

            <UnsavedChangesDialog
                open={closeWarningOpen}
                onDiscard={handleConfirmClose}
                onCancel={() => setCloseWarningOpen(false)}
                message="You have unsaved changes. Are you sure you want to close?"
                discardLabel="Discard & Close"
            />
        </div>
    );
}

export function BuilderPane() {
    return (
        <ReactFlowProvider>
            <BuilderPaneInner />
        </ReactFlowProvider>
    );
}
