import { useCallback, useMemo, useState } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import {
    Input,
    Switch,
    Text,
    makeStyles,
    mergeClasses,
    tokens,
} from "@fluentui/react-components";
import type { BuilderNode, ProducerNodeData } from "../../../models/builder.ts";
import { useBuilderContext } from "../../../contexts/BuilderContext.tsx";
import dataproducerIcon from "../../../assets/dataproducer-icon.svg";
import { WithRow } from "./withs/WithRow.tsx";

const useStyles = makeStyles({
    node: {
        backgroundColor: tokens.colorNeutralBackground1,
        border: `1px solid ${tokens.colorNeutralStroke2}`,
        borderRadius: tokens.borderRadiusLarge,
        minWidth: "220px",
        maxWidth: "300px",
        boxShadow: tokens.shadow4,
    },
    selected: {
        borderColor: tokens.colorBrandStroke1 as string as never,
        boxShadow: tokens.shadow8Brand,
    },
    withDropTarget: {
        borderColor: tokens.colorBrandStroke1 as string as never,
        borderStyle: "dashed" as string as never,
        backgroundColor: tokens.colorBrandBackground2,
    },
    header: {
        display: "flex",
        alignItems: "center",
        gap: tokens.spacingHorizontalXS,
        padding: `${tokens.spacingVerticalXS} ${tokens.spacingHorizontalS}`,
        backgroundColor: tokens.colorPaletteYellowBackground1,
        borderRadius: `${tokens.borderRadiusLarge} ${tokens.borderRadiusLarge} 0 0`,
        borderBottom: `1px solid ${tokens.colorNeutralStroke2}`,
    },
    icon: {
        width: "18px",
        height: "18px",
        flexShrink: 0,
    },
    body: {
        padding: tokens.spacingHorizontalS,
        display: "flex",
        flexDirection: "column",
        gap: tokens.spacingVerticalXS,
    },
    field: {
        display: "flex",
        alignItems: "center",
        gap: tokens.spacingHorizontalXS,
    },
    footer: {
        borderTop: `1px solid ${tokens.colorNeutralStroke2}`,
    },
    section: {
        borderTop: `1px solid ${tokens.colorNeutralStroke2}`,
        paddingTop: tokens.spacingVerticalXS,
        marginTop: tokens.spacingVerticalXXS,
        display: "flex",
        flexDirection: "column",
        gap: tokens.spacingVerticalXS,
    },
});

export function ProducerNode({ id, data, selected }: NodeProps<BuilderNode>) {
    const nodeData = data as ProducerNodeData;
    const { state, dispatch } = useBuilderContext();
    const styles = useStyles();
    const [withDragOver, setWithDragOver] = useState(false);

    const onDragOver = useCallback((e: React.DragEvent) => {
        if (e.dataTransfer.types.includes("application/testengine-type")) {
            e.preventDefault();
            e.dataTransfer.dropEffect = "copy";
            setWithDragOver(true);
        }
    }, []);

    const onDragLeave = useCallback(() => {
        setWithDragOver(false);
    }, []);

    const onDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setWithDragOver(false);
        const type = e.dataTransfer.getData("application/testengine-type");
        if (type !== "with") return;
        dispatch({
            type: "UPDATE_NODE",
            payload: {
                id,
                data: {
                    withMutations: [
                        ...nodeData.withMutations,
                        { path: "", value: { type: "string", value: "" } },
                    ],
                },
            },
        });
    }, [dispatch, id, nodeData.withMutations]);

    // Compute previous producer nodes (those that appear before this node in the edge chain)
    const previousProducers = useMemo(() => {
        const predecessorIds = new Set<string>();
        const visited = new Set<string>();

        function collectPredecessors(nodeId: string) {
            if (visited.has(nodeId)) return;
            visited.add(nodeId);
            for (const edge of state.edges) {
                if (edge.target === nodeId) {
                    predecessorIds.add(edge.source);
                    collectPredecessors(edge.source);
                }
            }
        }

        collectPredecessors(id);

        return state.nodes
            .filter((n) => {
                const d = n.data as ProducerNodeData;
                return predecessorIds.has(n.id) && d.nodeType === "producer" && !d.anonymous;
            })
            .map((n) => n.data as ProducerNodeData);
    }, [id, state.nodes, state.edges]);

    return (
        <div
            className={mergeClasses(
                styles.node,
                selected && styles.selected,
                withDragOver && styles.withDropTarget,
            )}
            onDragOver={onDragOver}
            onDragLeave={onDragLeave}
            onDrop={onDrop}
        >
            <div className={styles.header}>
                <img src={dataproducerIcon} alt="" className={styles.icon} />
                <Text size={200} weight="semibold">{nodeData.draftId} ({nodeData.entityName})</Text>
            </div>

            <div className={styles.body}>
                {/* FIELDS */}
                {nodeData.anonymous ? (
                    <div className={styles.field}>
                        <Text size={100} style={{ color: tokens.colorNeutralForeground4, fontStyle: "italic" }}>(anonymous)</Text>
                    </div>
                ) : (
                    <div className={styles.field}>
                        <Text size={100} style={{ minWidth: "55px", color: tokens.colorNeutralForeground3 }}>Variable</Text>
                        <Input
                            size="small"
                            value={nodeData.variableName}
                            onChange={(_ev, data) =>
                                dispatch({
                                    type: "UPDATE_NODE",
                                    payload: { id, data: { variableName: data.value } },
                                })
                            }
                            style={{ flex: 1 }}
                        />
                    </div>
                )}

                {/* WITHS */}
                {nodeData.withMutations.length > 0 && (
                    <div className={styles.section}>
                        {nodeData.withMutations.map((m, i) => (
                            <WithRow
                                key={i}
                                dsl={m}
                                entityName={nodeData.entityName}
                                previousProducers={previousProducers}
                                onPathChange={(path) => {
                                    const updated = [...nodeData.withMutations];
                                    updated[i] = { ...m, path };
                                    dispatch({
                                        type: "UPDATE_NODE",
                                        payload: { id, data: { withMutations: updated } },
                                    });
                                }}
                                onValueChange={(value) => {
                                    const updated = [...nodeData.withMutations];
                                    updated[i] = { ...m, value };
                                    dispatch({
                                        type: "UPDATE_NODE",
                                        payload: { id, data: { withMutations: updated } },
                                    });
                                }}
                            />
                        ))}
                    </div>
                )}
            </div>

            {/* FOOTER */}
            <div className={styles.footer}>
                <div style={{ display: "flex", gap: tokens.spacingHorizontalS }}>
                    <Switch
                        size="small"
                        label="Build"
                        checked={nodeData.build}
                        onChange={(_ev, data) =>
                            dispatch({
                                type: "UPDATE_NODE",
                                payload: { id, data: { build: data.checked } },
                            })
                        }
                        style={{ fontSize: tokens.fontSizeBase200 }}
                    />
                    <Switch
                        size="small"
                        label="Anon"
                        checked={nodeData.anonymous}
                        onChange={(_ev, data) =>
                            dispatch({
                                type: "UPDATE_NODE",
                                payload: { id, data: { anonymous: data.checked } },
                            })
                        }
                        style={{ fontSize: tokens.fontSizeBase200 }}
                    />
                </div>
            </div>

            <Handle type="source" position={Position.Bottom} />
            <Handle type="target" position={Position.Top} />
        </div>
    );
}
