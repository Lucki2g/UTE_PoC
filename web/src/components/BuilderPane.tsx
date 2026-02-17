import { useCallback, useMemo, useRef, useState, type DragEvent } from "react";
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
const NODE_SPACING = 150;
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

/** Sort nodes by Y position (top to bottom). */
function sortedByY(nodes: BuilderNode[]): BuilderNode[] {
    return [...nodes].sort((a, b) => a.position.y - b.position.y);
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

    const [newDialogOpen, setNewDialogOpen] = useState(false);
    const [newTestName, setNewTestName] = useState("");
    const [newClassName, setNewClassName] = useState("");
    const [newFolderName, setNewFolderName] = useState("");
    const [createBranch, setCreateBranch] = useState(false);
    const [newBranchName, setNewBranchName] = useState("");
    const [closeWarningOpen, setCloseWarningOpen] = useState(false);
    const [isDragging, setIsDragging] = useState(false);
    const dragEnterCounter = useRef(0);

    // ─── ReactFlow callbacks ─────────────────────────────────────────────────

    const onNodesChange: OnNodesChange<BuilderNode> = useCallback(
        (changes) => {
            dispatch({ type: "SET_NODES", payload: applyNodeChanges(changes, state.nodes) });
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

    const onDragEnter = useCallback((e: DragEvent) => {
        if (!state.testName) return;
        if (e.dataTransfer.types.includes("application/testengine-type")) {
            dragEnterCounter.current++;
            setIsDragging(true);
        }
    }, [state.testName]);

    const onDragLeave = useCallback(() => {
        dragEnterCounter.current--;
        if (dragEnterCounter.current <= 0) {
            dragEnterCounter.current = 0;
            setIsDragging(false);
        }
    }, []);

    const onDragOver = useCallback((e: DragEvent) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "copy";
    }, []);

    // ─── Drop handling ───────────────────────────────────────────────────────

    /** Append node at the end of the diagram. */
    const appendNode = useCallback(
        (node: BuilderNode) => {
            dispatch({ type: "ADD_NODE", payload: node });
            if (state.nodes.length > 0) {
                const sorted = sortedByY(state.nodes);
                const lastNode = sorted[sorted.length - 1];
                const edge = {
                    id: `e_${lastNode.id}_${node.id}`,
                    source: lastNode.id,
                    target: node.id,
                };
                dispatch({ type: "SET_EDGES", payload: [...state.edges, edge] });
            }
        },
        [dispatch, state.nodes, state.edges],
    );

    /** Insert node at a specific index in the Y-sorted node list. */
    const insertNodeAt = useCallback(
        (index: number, node: BuilderNode) => {
            const sorted = sortedByY(state.nodes);

            // If index is at the end, just append
            if (index >= sorted.length) {
                appendNode(node);
                return;
            }

            // Shift nodes at and below the insertion point down
            const updatedNodes = sorted.map((n, i) => {
                if (i >= index) {
                    return { ...n, position: { ...n.position, y: n.position.y + NODE_SPACING } };
                }
                return n;
            });

            // Insert the new node
            const allNodes = [...updatedNodes.slice(0, index), node, ...updatedNodes.slice(index)];

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
                    id: `e_${prev.id}_${node.id}`,
                    source: prev.id,
                    target: node.id,
                });
            }

            // Connect new node → next
            if (next) {
                newEdges.push({
                    id: `e_${node.id}_${next.id}`,
                    source: node.id,
                    target: next.id,
                });
            }

            dispatch({ type: "SET_NODES", payload: allNodes });
            dispatch({ type: "SET_EDGES", payload: newEdges });
        },
        [dispatch, state.nodes, state.edges, appendNode],
    );

    /** Handle a drop on a specific drop-zone index. */
    const handleDropAtIndex = useCallback(
        (index: number, e: DragEvent) => {
            const type = e.dataTransfer.getData("application/testengine-type");
            const rawData = e.dataTransfer.getData("application/testengine-data");
            if (!type) return;

            const sorted = sortedByY(state.nodes);
            // Position node at the drop zone's Y
            let y: number;
            if (index === 0) {
                y = (sorted[0]?.position.y ?? 50) - NODE_SPACING;
            } else if (index >= sorted.length) {
                y = (sorted[sorted.length - 1]?.position.y ?? 50) + NODE_SPACING;
            } else {
                y = (sorted[index - 1].position.y + sorted[index].position.y) / 2;
            }

            const node = createNodeFromDrop(type, rawData, NODE_X, y);
            if (!node) return;

            insertNodeAt(index, node);
            setIsDragging(false);
            dragEnterCounter.current = 0;
        },
        [state.nodes, insertNodeAt],
    );

    /** Handle a drop on the canvas background (not on a drop zone). */
    const onDrop = useCallback(
        (e: DragEvent) => {
            e.preventDefault();
            setIsDragging(false);
            dragEnterCounter.current = 0;

            if (!state.testName) return;

            const type = e.dataTransfer.getData("application/testengine-type");
            const rawData = e.dataTransfer.getData("application/testengine-data");
            if (!type) return;

            // Convert screen position to flow position
            const position = reactFlow.screenToFlowPosition({
                x: e.clientX,
                y: e.clientY,
            });

            const node = createNodeFromDrop(type, rawData, position.x, position.y);
            if (!node) return;

            appendNode(node);
        },
        [state.testName, reactFlow, appendNode],
    );

    // ─── Drop zone nodes ─────────────────────────────────────────────────────

    const dropZoneNodes = useMemo((): Node[] => {
        if (!isDragging || state.nodes.length === 0) return [];

        const sorted = sortedByY(state.nodes);
        const zones: Node[] = [];

        // Zone above first node
        zones.push({
            id: "dz_0",
            type: "dropZone",
            position: { x: NODE_X, y: sorted[0].position.y - NODE_SPACING / 2 - DROP_ZONE_HEIGHT / 2 },
            data: {
                nodeType: "dropZone",
                insertionIndex: 0,
                onDropAtIndex: handleDropAtIndex,
            } satisfies DropZoneNodeData,
            selectable: false,
            draggable: false,
        });

        // Zones between consecutive nodes
        for (let i = 0; i < sorted.length - 1; i++) {
            const midY = (sorted[i].position.y + sorted[i + 1].position.y) / 2;
            zones.push({
                id: `dz_${i + 1}`,
                type: "dropZone",
                position: { x: NODE_X, y: midY - DROP_ZONE_HEIGHT / 2 },
                data: {
                    nodeType: "dropZone",
                    insertionIndex: i + 1,
                    onDropAtIndex: handleDropAtIndex,
                } satisfies DropZoneNodeData,
                selectable: false,
                draggable: false,
            });
        }

        // Zone below last node
        zones.push({
            id: `dz_${sorted.length}`,
            type: "dropZone",
            position: { x: NODE_X, y: sorted[sorted.length - 1].position.y + NODE_SPACING / 2 + DROP_ZONE_HEIGHT / 2 },
            data: {
                nodeType: "dropZone",
                insertionIndex: sorted.length,
                onDropAtIndex: handleDropAtIndex,
            } satisfies DropZoneNodeData,
            selectable: false,
            draggable: false,
        });

        return zones;
    }, [isDragging, state.nodes, handleDropAtIndex]);

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

            <div className={styles.canvas}>
                <ReactFlow
                    nodes={displayNodes}
                    edges={state.edges}
                    onNodesChange={onNodesChange}
                    onEdgesChange={onEdgesChange}
                    onConnect={onConnect}
                    onDragOver={onDragOver}
                    onDragEnter={onDragEnter}
                    onDragLeave={onDragLeave}
                    onDrop={onDrop}
                    nodeTypes={nodeTypes}
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
