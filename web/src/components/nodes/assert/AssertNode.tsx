import { useMemo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import {
    Combobox,
    Dropdown,
    Input,
    Menu,
    MenuButton,
    MenuItem,
    MenuList,
    MenuPopover,
    MenuTrigger,
    Option,
    Text,
    makeStyles,
    tokens,
} from "@fluentui/react-components";
import { DeleteRegular, MoreHorizontalRegular } from "@fluentui/react-icons";
import type { BuilderNode, AssertNodeData, ProducerNodeData, ServiceNodeData } from "../../../models/builder.ts";
import { useBuilderContext } from "../../../contexts/BuilderContext.tsx";
import { ColumnLookup } from "../../fields/ColumnLookup.tsx";
import assertIcon from "../../../assets/assert-icon.svg";

const assertionKinds = ["notNull", "be", "containSingle"] as const;

const useStyles = makeStyles({
    node: {
        backgroundColor: tokens.colorNeutralBackground1,
        border: `1px solid ${tokens.colorNeutralStroke2}`,
        borderRadius: tokens.borderRadiusLarge,
        width: "280px",
        boxShadow: tokens.shadow4,
    },
    selected: {
        borderColor: tokens.colorBrandStroke1 as string as never,
        boxShadow: tokens.shadow8Brand,
    },
    header: {
        display: "flex",
        alignItems: "center",
        gap: tokens.spacingHorizontalXS,
        padding: `${tokens.spacingVerticalXS} ${tokens.spacingHorizontalS}`,
        backgroundColor: tokens.colorPaletteLavenderBackground2,
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
        padding: tokens.spacingHorizontalS,
        display: "flex",
        alignItems: "center",
        gap: tokens.spacingHorizontalXS,
    },
});

interface VarInfo {
    name: string;
    entityName: string | null;
    isList: boolean;
}

export function AssertNode({ id, data, selected }: NodeProps<BuilderNode>) {
    const nodeData = data as AssertNodeData;
    const { state, dispatch } = useBuilderContext();
    const styles = useStyles();

    // Collect available variables with their entity info
    const varInfos = useMemo(() => {
        const infos: VarInfo[] = [];
        for (const n of state.nodes) {
            const d = n.data as ProducerNodeData | ServiceNodeData;
            if (d.nodeType === "producer" && !d.anonymous && d.variableName) {
                infos.push({ name: d.variableName, entityName: d.entityName, isList: false });
            } else if (d.nodeType === "service" && (d.operation === "RetrieveList" || d.operation === "RetrieveSingle") && d.resultVar) {
                // Derive entity name from entitySet by removing trailing "Set"
                const entityName = d.entitySet?.replace(/Set$/i, "") ?? null;
                infos.push({ name: d.resultVar, entityName, isList: d.operation === "RetrieveList" });
            }
        }
        return infos;
    }, [state.nodes]);

    const selectedVarInfo = useMemo(
        () => varInfos.find((v) => v.name === nodeData.targetVar) ?? null,
        [varInfos, nodeData.targetVar],
    );

    const hasExpected = nodeData.assertionKind === "be" || nodeData.assertionKind === "containSingle";

    return (
        <div className={`${styles.node} ${selected ? styles.selected : ""}`}>
            <div className={styles.header}>
                <img src={assertIcon} alt="" className={styles.icon} />
                <Text size={200} weight="semibold" style={{ flex: 1 }}>Assert</Text>
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

            <div className={styles.body}>
                {/* TARGET VAR */}
                <div className={styles.field}>
                    <Text size={100} style={{ minWidth: "55px", color: tokens.colorNeutralForeground3 }}>Target</Text>
                    <Combobox
                        size="small"
                        freeform
                        value={nodeData.targetVar ?? ""}
                        selectedOptions={nodeData.targetVar ? [nodeData.targetVar] : []}
                        onOptionSelect={(_ev, d) =>
                            dispatch({
                                type: "UPDATE_NODE",
                                payload: { id, data: { targetVar: d.optionText ?? d.optionValue } },
                            })
                        }
                        onChange={(ev) =>
                            dispatch({
                                type: "UPDATE_NODE",
                                payload: { id, data: { targetVar: ev.target.value } },
                            })
                        }
                        style={{ flex: 1, minWidth: "120px" }}
                    >
                        {varInfos.map((v) => (
                            <Option key={v.name} value={v.name}>{v.name}</Option>
                        ))}
                    </Combobox>
                </div>

                {/* TARGET MEMBER PATH */}
                {selectedVarInfo && (
                    <div className={styles.field}>
                        <Text size={100} style={{ minWidth: "55px", color: tokens.colorNeutralForeground3 }}>Member</Text>
                        {selectedVarInfo.isList ? (
                            <Combobox
                                size="small"
                                freeform
                                value={nodeData.targetPath?.[0] ?? ""}
                                selectedOptions={nodeData.targetPath?.[0] ? [nodeData.targetPath[0]] : []}
                                onOptionSelect={(_ev, d) => {
                                    const member = d.optionText ?? d.optionValue ?? "";
                                    dispatch({
                                        type: "UPDATE_NODE",
                                        payload: { id, data: { targetPath: member ? [member] : [] } },
                                    });
                                }}
                                onChange={(ev) => {
                                    const member = ev.target.value;
                                    dispatch({
                                        type: "UPDATE_NODE",
                                        payload: { id, data: { targetPath: member ? [member] : [] } },
                                    });
                                }}
                                style={{ flex: 1, minWidth: "80px" }}
                            >
                                <Option key="Count" value="Count">Count</Option>
                            </Combobox>
                        ) : selectedVarInfo.entityName ? (
                            <ColumnLookup
                                entityName={selectedVarInfo.entityName}
                                value={nodeData.targetPath?.[0] ?? ""}
                                onChange={(col) =>
                                    dispatch({
                                        type: "UPDATE_NODE",
                                        payload: { id, data: { targetPath: col ? [col] : [] } },
                                    })
                                }
                            />
                        ) : (
                            <Input
                                size="small"
                                value={nodeData.targetPath?.[0] ?? ""}
                                placeholder="member"
                                onChange={(_ev, d) =>
                                    dispatch({
                                        type: "UPDATE_NODE",
                                        payload: { id, data: { targetPath: d.value ? [d.value] : [] } },
                                    })
                                }
                                style={{ flex: 1 }}
                            />
                        )}
                    </div>
                )}

                {/* KIND */}
                <div className={styles.field}>
                    <Text size={100} style={{ minWidth: "55px", color: tokens.colorNeutralForeground3 }}>Kind</Text>
                    <Dropdown
                        size="small"
                        value={nodeData.assertionKind}
                        selectedOptions={[nodeData.assertionKind]}
                        onOptionSelect={(_ev, d) =>
                            dispatch({
                                type: "UPDATE_NODE",
                                payload: { id, data: { assertionKind: d.optionValue } },
                            })
                        }
                        style={{ minWidth: "120px" }}
                    >
                        {assertionKinds.map((k) => (
                            <Option key={k} value={k}>{k}</Option>
                        ))}
                    </Dropdown>
                </div>
            </div>

            {/* EXPECTED — footer */}
            {hasExpected && (
                <div className={styles.footer}>
                    <Text size={100} style={{ minWidth: "55px", color: tokens.colorNeutralForeground3 }}>Expected</Text>
                    <Input
                        size="small"
                        value={nodeData.expectedValue ?? ""}
                        placeholder="expected value"
                        onChange={(_ev, d) =>
                            dispatch({
                                type: "UPDATE_NODE",
                                payload: { id, data: { expectedValue: d.value } },
                            })
                        }
                        style={{ flex: 1 }}
                    />
                </div>
            )}

            <Handle type="target" position={Position.Top} />
        </div>
    );
}
