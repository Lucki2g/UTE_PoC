import { useCallback, useMemo, useState, type DragEvent } from "react";
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
    Background,
    Controls,
    addEdge,
    type Connection,
    type OnNodesChange,
    type OnEdgesChange,
    applyNodeChanges,
    applyEdgeChanges,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useBuilderContext } from "../contexts/BuilderContext.tsx";
import { useTests } from "../hooks/useTests.ts";
import { generateDsl } from "../util/dslGenerator.ts";
import { ProducerNode } from "./nodes/producer/ProducerNode.tsx";
import { ServiceNode } from "./nodes/dao/ServiceNode.tsx";
import { AssertNode } from "./nodes/assert/AssertNode.tsx";
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
};

let nodeIdCounter = 0;
function nextId() {
    return `node_${++nodeIdCounter}_${Date.now()}`;
}

const NODE_X = 250;
const NODE_SPACING = 150;

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
    placeholder: {
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        height: "100%",
        gap: tokens.spacingVerticalM,
    },
    dirtyBadge: {
        marginLeft: tokens.spacingHorizontalXS,
        backgroundColor: tokens.colorPaletteDarkOrangeBackground3,
    },
});

export function BuilderPane() {
    const { state, dispatch } = useBuilderContext();
    const tests = useTests();
    const styles = useStyles();

    const [newDialogOpen, setNewDialogOpen] = useState(false);
    const [newTestName, setNewTestName] = useState("");
    const [closeWarningOpen, setCloseWarningOpen] = useState(false);

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

    const nextY = useMemo(() => {
        if (state.nodes.length === 0) return 50;
        const maxY = Math.max(...state.nodes.map((n) => n.position.y));
        return maxY + NODE_SPACING;
    }, [state.nodes]);

    const onDragOver = useCallback((e: DragEvent) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "copy";
    }, []);

    const onDrop = useCallback(
        (e: DragEvent) => {
            e.preventDefault();
            const type = e.dataTransfer.getData("application/testengine-type");
            const rawData = e.dataTransfer.getData("application/testengine-data");

            if (!type) return;

            let node: BuilderNode | null = null;

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
                    node = {
                        id: nextId(),
                        type: "producer",
                        position: { x: NODE_X, y: nextY },
                        data,
                    };
                    break;
                }
                case "assert": {
                    const data: AssertNodeData = {
                        nodeType: "assert",
                        assertionKind: rawData || "notNull",
                        targetVar: "",
                        expectedValue: "",
                    };
                    node = {
                        id: nextId(),
                        type: "assert",
                        position: { x: NODE_X, y: nextY },
                        data,
                    };
                    break;
                }
                case "where":
                case "with":
                case "build":
                case "extension":
                    if (type === "where") {
                        const data: ServiceNodeData = {
                            nodeType: "service",
                            operation: "RetrieveList",
                            whereExpressions: [{ column: "", operator: "equals", value: "" }],
                        };
                        node = {
                            id: nextId(),
                            type: "service",
                            position: { x: NODE_X, y: nextY },
                            data,
                        };
                    }
                    break;
            }

            if (node) {
                dispatch({ type: "ADD_NODE", payload: node });

                if (state.nodes.length > 0) {
                    const lastNode = state.nodes[state.nodes.length - 1];
                    const edge = {
                        id: `e_${lastNode.id}_${node.id}`,
                        source: lastNode.id,
                        target: node.id,
                    };
                    dispatch({ type: "SET_EDGES", payload: [...state.edges, edge] });
                }
            }
        },
        [dispatch, nextY, state.nodes, state.edges],
    );

    const handleSave = useCallback(async () => {
        if (!state.testName) return;
        const dsl = generateDsl(state.nodes, state.testName);
        if (state.testClassName) {
            await tests.update({ className: state.testClassName, code: dsl });
        } else {
            await tests.create({ code: dsl });
        }
        dispatch({ type: "MARK_CLEAN" });
    }, [state, tests, dispatch]);

    const handleSaveAndPublish = useCallback(async () => {
        if (!state.testName) return;
        const dsl = generateDsl(state.nodes, state.testName);
        if (state.testClassName) {
            await tests.update({ className: state.testClassName, code: dsl });
        } else {
            await tests.create({ code: dsl });
        }
        dispatch({ type: "MARK_CLEAN" });
    }, [state, tests, dispatch]);

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

    const handleCreateNew = useCallback(() => {
        const name = newTestName.trim();
        if (!name) return;
        dispatch({ type: "CLEAR" });
        dispatch({
            type: "SET_DIAGRAM",
            payload: {
                nodes: [],
                edges: [],
                testName: name,
                testClassName: null,
                dirty: false,
            },
        });
        setNewDialogOpen(false);
        setNewTestName("");
    }, [dispatch, newTestName]);

    const isEmpty = state.nodes.length === 0;
    const hasTestOpen = !!state.testName;

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
                                    <DialogContent>
                                        <Input
                                            placeholder="Test case name"
                                            value={newTestName}
                                            onChange={(_ev, data) => setNewTestName(data.value)}
                                            onKeyDown={(e) => { if (e.key === "Enter") handleCreateNew(); }}
                                            style={{ width: "100%" }}
                                        />
                                    </DialogContent>
                                    <DialogActions>
                                        <DialogTrigger disableButtonEnhancement>
                                            <Button appearance="secondary">Cancel</Button>
                                        </DialogTrigger>
                                        <Button
                                            appearance="primary"
                                            onClick={handleCreateNew}
                                            disabled={!newTestName.trim()}
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
                {isEmpty ? (
                    <div className={styles.placeholder}>
                        <HexagonRegular fontSize={48} style={{ opacity: 0.2 }} />
                        <Text size={300} style={{ color: tokens.colorNeutralForeground4 }}>
                            Select a test or drag components to begin
                        </Text>
                        <Text size={200} style={{ color: tokens.colorNeutralForeground4 }}>
                            Drag DataProducers, Services, and Asserts from the right panel
                        </Text>
                    </div>
                ) : (
                    <ReactFlow
                        nodes={state.nodes}
                        edges={state.edges}
                        onNodesChange={onNodesChange}
                        onEdgesChange={onEdgesChange}
                        onConnect={onConnect}
                        onDragOver={onDragOver}
                        onDrop={onDrop}
                        nodeTypes={nodeTypes}
                        fitView
                        proOptions={{ hideAttribution: true }}
                    >
                        <Background />
                        <Controls />
                        {state.dirty && (
                            <div style={{ position: "absolute", top: tokens.spacingVerticalM, right: tokens.spacingHorizontalM }}>
                                <Badge icon={<BeakerSettingsRegular />} size="medium" className={styles.dirtyBadge}>
                                    Unsaved Changes
                                </Badge>
                            </div>
                        )}
                    </ReactFlow>
                )}
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
