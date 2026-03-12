import { useCallback, useMemo, useState } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import {
    Combobox,
    Input,
    Dropdown,
    Menu,
    MenuButton,
    MenuItem,
    MenuList,
    MenuPopover,
    MenuTrigger,
    Option,
    Switch,
    Text,
    ToggleButton,
    makeStyles,
    mergeClasses,
    tokens,
} from "@fluentui/react-components";
import { DeleteRegular, MoreHorizontalRegular } from "@fluentui/react-icons";
import type { BuilderNode, ServiceNodeData, ProducerNodeData, WhereEntry } from "../../../models/builder.ts";
import { useBuilderContext } from "../../../contexts/BuilderContext.tsx";
import dataverseserviceIcon from "../../../assets/dataverseservice-icon.svg";
import { WithRow } from "../producer/withs/WithRow.tsx";
import { WhereRow } from "./where/WhereRow.tsx";
import { useEntityNames } from "../../../hooks/useEntityNames.ts";

const operations = ["Create", "Update", "RetrieveSingle", "RetrieveList", "Delete"] as const;

const useStyles = makeStyles({
    node: {
        backgroundColor: tokens.colorNeutralBackground1,
        border: `1px solid ${tokens.colorNeutralStroke2}`,
        borderRadius: tokens.borderRadiusLarge,
        width: "480px",
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
        backgroundColor: tokens.colorPaletteGreenBackground1,
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
    section: {
        borderTop: `1px solid ${tokens.colorNeutralStroke2}`,
        paddingTop: tokens.spacingVerticalXS,
        marginTop: tokens.spacingVerticalXXS,
        display: "flex",
        flexDirection: "column",
        gap: tokens.spacingVerticalXS,
    },
    withRow: {
        display: "flex",
        alignItems: "center",
        gap: tokens.spacingHorizontalXXS,
        fontSize: tokens.fontSizeBase100,
        padding: `${tokens.spacingVerticalXXS} 0`,
    },
    whereDropTarget: {
        borderColor: tokens.colorPaletteBlueBorderActive as string as never,
        borderStyle: "dashed" as string as never,
        backgroundColor: tokens.colorPaletteBlueBackground2,
    },
    whereLogicRow: {
        display: "flex",
        alignItems: "center",
        gap: tokens.spacingHorizontalXS,
        paddingBottom: tokens.spacingVerticalXXS,
    },
});

export function ServiceNode({ id, data, selected }: NodeProps<BuilderNode>) {
    const nodeData = data as ServiceNodeData;
    const { state, dispatch } = useBuilderContext();
    const styles = useStyles();
    const [withDragOver, setWithDragOver] = useState(false);
    const [whereDragOver, setWhereDragOver] = useState(false);
    const { names: entityNames } = useEntityNames();

    const isRetrieve = nodeData.operation === "RetrieveList"
        || nodeData.operation === "RetrieveSingle";
    const isUpdate = nodeData.operation === "Update";

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

    // For Update With blocks: find the producer that matches targetBinding to get entity name
    const targetProducer = useMemo(() => {
        if (!isUpdate || !nodeData.targetBinding) return null;
        return previousProducers.find((d) => d.variableName === nodeData.targetBinding) ?? null;
    }, [isUpdate, nodeData.targetBinding, previousProducers]);

    const withMutations = nodeData.withMutations ?? [];
    const whereExpressions = nodeData.whereExpressions ?? [];
    const whereLogicOp = nodeData.whereLogicOp ?? "and";

    const onDragOver = useCallback((e: React.DragEvent) => {
        if (!isUpdate) return;
        if (e.dataTransfer.types.includes("application/testengine-type")) {
            e.preventDefault();
            e.dataTransfer.dropEffect = "copy";
            setWithDragOver(true);
        }
    }, [isUpdate]);

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
                        ...withMutations,
                        { path: "", value: { type: "string", value: "" } },
                    ],
                },
            },
        });
    }, [dispatch, id, withMutations]);

    const onWhereDragOver = useCallback((e: React.DragEvent) => {
        if (!isRetrieve) return;
        if (e.dataTransfer.types.includes("application/testengine-type")) {
            e.preventDefault();
            e.dataTransfer.dropEffect = "copy";
            setWhereDragOver(true);
        }
    }, [isRetrieve]);

    const onWhereDragLeave = useCallback(() => {
        setWhereDragOver(false);
    }, []);

    const onWhereDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setWhereDragOver(false);
        const type = e.dataTransfer.getData("application/testengine-type");
        if (type !== "where") return;
        const newEntry: WhereEntry = { column: "", operator: "==", value: { type: "string", value: "" } };
        dispatch({
            type: "UPDATE_NODE",
            payload: { id, data: { whereExpressions: [...whereExpressions, newEntry] } },
        });
    }, [dispatch, id, whereExpressions]);

    const updateWhereEntry = useCallback((index: number, updated: WhereEntry) => {
        const next = [...whereExpressions];
        next[index] = updated;
        dispatch({ type: "UPDATE_NODE", payload: { id, data: { whereExpressions: next } } });
    }, [dispatch, id, whereExpressions]);

    const removeWhereEntry = useCallback((index: number) => {
        const next = whereExpressions.filter((_, i) => i !== index);
        dispatch({ type: "UPDATE_NODE", payload: { id, data: { whereExpressions: next } } });
    }, [dispatch, id, whereExpressions]);

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
                <img src={dataverseserviceIcon} alt="" className={styles.icon} />
                <Text size={200} weight="semibold" style={{ flex: 1 }}>DataverseService</Text>
                <Menu>
                    <MenuTrigger disableButtonEnhancement>
                        <MenuButton appearance="subtle" icon={<MoreHorizontalRegular />} size="small" />
                    </MenuTrigger>
                    <MenuPopover>
                        <MenuList>
                            <MenuItem
                                icon={<DeleteRegular />}
                                onClick={() => dispatch({ type: "REMOVE_NODE", payload: id })}
                            >
                                Delete
                            </MenuItem>
                        </MenuList>
                    </MenuPopover>
                </Menu>
            </div>

            {/* OPERATION */}
            <div className={styles.body}>
                <div className={styles.field}>
                    <Text size={100} style={{ minWidth: "55px", color: tokens.colorNeutralForeground3 }}>Operation</Text>
                    <Dropdown
                        size="small"
                        value={nodeData.operation}
                        selectedOptions={[nodeData.operation]}
                        onOptionSelect={(_ev, data) =>
                            dispatch({
                                type: "UPDATE_NODE",
                                payload: {
                                    id,
                                    data: { operation: data.optionValue as ServiceNodeData["operation"] },
                                },
                            })
                        }
                        style={{ minWidth: "120px" }}
                    >
                        {operations.map((op) => (
                            <Option key={op} value={op}>{op}</Option>
                        ))}
                    </Dropdown>
                </div>

                {!isRetrieve && (
                    <>
                        <div className={styles.field}>
                            <Text size={100} style={{ minWidth: "55px", color: tokens.colorNeutralForeground3 }}>Target</Text>
                            {isUpdate ? (
                                <Dropdown
                                    size="small"
                                    value={nodeData.targetBinding ?? ""}
                                    selectedOptions={nodeData.targetBinding ? [nodeData.targetBinding] : []}
                                    placeholder="select producer"
                                    onOptionSelect={(_ev, data) =>
                                        dispatch({
                                            type: "UPDATE_NODE",
                                            payload: { id, data: { targetBinding: data.optionValue ?? "" } },
                                        })
                                    }
                                    style={{ flex: 1 }}
                                >
                                    {previousProducers.map((p) => (
                                        <Option key={p.variableName} value={p.variableName}>{p.variableName}</Option>
                                    ))}
                                </Dropdown>
                            ) : (
                                <Input
                                    size="small"
                                    value={nodeData.targetBinding ?? ""}
                                    placeholder="binding id"
                                    onChange={(_ev, data) =>
                                        dispatch({
                                            type: "UPDATE_NODE",
                                            payload: { id, data: { targetBinding: data.value } },
                                        })
                                    }
                                    style={{ flex: 1 }}
                                />
                            )}
                        </div>
                        <div className={styles.field}>
                            <Switch
                                size="small"
                                label="Delegate"
                                checked={nodeData.isDelegateAct ?? false}
                                onChange={(_ev, data) =>
                                    dispatch({
                                        type: "UPDATE_NODE",
                                        payload: { id, data: { isDelegateAct: data.checked } },
                                    })
                                }
                                style={{ fontSize: tokens.fontSizeBase200 }}
                            />
                            {nodeData.isDelegateAct && (
                                <Input
                                    size="small"
                                    value={nodeData.delegateVar ?? "action"}
                                    placeholder="action"
                                    onChange={(_ev, data) =>
                                        dispatch({
                                            type: "UPDATE_NODE",
                                            payload: { id, data: { delegateVar: data.value } },
                                        })
                                    }
                                    style={{ flex: 1 }}
                                />
                            )}
                        </div>
                    </>
                )}

                {/* WITH MUTATIONS — Update only, shown when target resolves to a known producer */}
                {isUpdate && targetProducer && withMutations.length > 0 && (
                    <div className={styles.section}>
                        {withMutations.map((m, i) => (
                            <WithRow
                                key={i}
                                dsl={m}
                                entityName={targetProducer.entityName}
                                previousProducers={previousProducers}
                                onPathChange={(path) => {
                                    const updated = [...withMutations];
                                    updated[i] = { ...m, path };
                                    dispatch({
                                        type: "UPDATE_NODE",
                                        payload: { id, data: { withMutations: updated } },
                                    });
                                }}
                                onValueChange={(value) => {
                                    const updated = [...withMutations];
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

                {isRetrieve && (
                    <>
                        <div className={styles.field}>
                            <Text size={100} style={{ minWidth: "55px", color: tokens.colorNeutralForeground3 }}>Variable</Text>
                            <Input
                                size="small"
                                value={nodeData.resultVar ?? ""}
                                placeholder="result variable"
                                onChange={(_ev, data) =>
                                    dispatch({
                                        type: "UPDATE_NODE",
                                        payload: { id, data: { resultVar: data.value } },
                                    })
                                }
                                style={{ flex: 1 }}
                            />
                        </div>
                        <div className={styles.field}>
                            <Text size={100} style={{ minWidth: "55px", color: tokens.colorNeutralForeground3 }}>Entity Set</Text>
                            <Combobox
                                size="small"
                                freeform
                                value={nodeData.entitySet ?? ""}
                                selectedOptions={nodeData.entitySet ? [nodeData.entitySet] : []}
                                placeholder="e.g. ape_skillSet"
                                onOptionSelect={(_ev, data) =>
                                    dispatch({
                                        type: "UPDATE_NODE",
                                        payload: { id, data: { entitySet: data.optionValue ?? "" } },
                                    })
                                }
                                onChange={(ev) =>
                                    dispatch({
                                        type: "UPDATE_NODE",
                                        payload: { id, data: { entitySet: ev.target.value } },
                                    })
                                }
                                style={{ flex: 1 }}
                                listbox={{ style: { maxHeight: "200px" } }}
                                positioning="below"
                            >
                                {entityNames.map((name) => (
                                    <Option key={name} value={name}>{name}</Option>
                                ))}
                            </Combobox>
                        </div>
                    </>
                )}

                {/* WHERE block — Retrieve only, drag +With chip to add rows */}
                {isRetrieve && (
                    <div
                        className={mergeClasses(styles.section, whereDragOver && styles.whereDropTarget)}
                        onDragOver={onWhereDragOver}
                        onDragLeave={onWhereDragLeave}
                        onDrop={onWhereDrop}
                    >
                        {whereExpressions.length > 1 && (
                            <div className={styles.whereLogicRow}>
                                <Text size={100} style={{ color: tokens.colorNeutralForeground3 }}>Logic</Text>
                                <ToggleButton
                                    size="small"
                                    appearance="subtle"
                                    checked={whereLogicOp === "and"}
                                    onClick={() =>
                                        dispatch({
                                            type: "UPDATE_NODE",
                                            payload: { id, data: { whereLogicOp: whereLogicOp === "and" ? "or" : "and" } },
                                        })
                                    }
                                >
                                    {whereLogicOp === "and" ? "AND" : "OR"}
                                </ToggleButton>
                            </div>
                        )}
                        {whereExpressions.map((w, i) => (
                            <WhereRow
                                key={i}
                                entry={w}
                                entityName={nodeData.entitySet ?? ""}
                                previousProducers={previousProducers}
                                onChange={(updated) => updateWhereEntry(i, updated)}
                                onDelete={() => removeWhereEntry(i)}
                            />
                        ))}
                        {whereExpressions.length === 0 && (
                            <Text size={100} style={{ color: tokens.colorNeutralForeground4, padding: `${tokens.spacingVerticalXXS} ${tokens.spacingHorizontalS}` }}>
                                Drag +Where here to add a filter condition
                            </Text>
                        )}
                    </div>
                )}
            </div>

            <Handle type="source" position={Position.Bottom} />
            <Handle type="target" position={Position.Top} />
        </div>
    );
}
