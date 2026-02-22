import { Handle, Position, type NodeProps } from "@xyflow/react";
import {
    Input,
    Dropdown,
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
import type { BuilderNode, ServiceNodeData } from "../../../models/builder.ts";
import { useBuilderContext } from "../../../contexts/BuilderContext.tsx";
import dataverseserviceIcon from "../../../assets/dataverseservice-icon.svg";

const operations = ["Create", "Update", "RetrieveSingle", "RetrieveList", "Delete"] as const;

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
    },
    withRow: {
        display: "flex",
        alignItems: "center",
        gap: tokens.spacingHorizontalXXS,
        fontSize: tokens.fontSizeBase100,
        padding: `${tokens.spacingVerticalXXS} 0`,
    },
});

export function ServiceNode({ id, data, selected }: NodeProps<BuilderNode>) {
    const nodeData = data as ServiceNodeData;
    const { dispatch } = useBuilderContext();
    const styles = useStyles();

    const isRetrieve = nodeData.operation === "RetrieveList"
        || nodeData.operation === "RetrieveSingle";

    return (
        <div className={`${styles.node} ${selected ? styles.selected : ""}`}>
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
                    <div className={styles.field}>
                        <Text size={100} style={{ minWidth: "55px", color: tokens.colorNeutralForeground3 }}>Target</Text>
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
                            <Input
                                size="small"
                                value={nodeData.entitySet ?? ""}
                                placeholder="e.g. ape_skillSet"
                                onChange={(_ev, data) =>
                                    dispatch({
                                        type: "UPDATE_NODE",
                                        payload: { id, data: { entitySet: data.value } },
                                    })
                                }
                                style={{ flex: 1 }}
                            />
                        </div>
                    </>
                )}

                {isRetrieve && nodeData.whereExpressions.length > 0 && (
                    <div className={styles.section}>
                        <Text size={100} style={{ color: tokens.colorNeutralForeground3 }}>Where</Text>
                        {nodeData.whereExpressions.map((w, i) => (
                            <div key={i} className={styles.withRow}>
                                <Text size={100} style={{ color: tokens.colorBrandForeground1 }}>{w.column}</Text>
                                <Text size={100} style={{ color: tokens.colorNeutralForeground4 }}>{w.operator}</Text>
                                <Text size={100}>{w.value}</Text>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            <Handle type="source" position={Position.Bottom} />
            <Handle type="target" position={Position.Top} />
        </div>
    );
}
