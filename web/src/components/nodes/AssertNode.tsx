import { Handle, Position, type NodeProps } from "@xyflow/react";
import {
    Input,
    Dropdown,
    Option,
    Text,
    makeStyles,
    tokens,
} from "@fluentui/react-components";
import type { BuilderNode, AssertNodeData } from "../../models/builder.ts";
import { useBuilderContext } from "../../contexts/BuilderContext.tsx";
import assertIcon from "../../assets/assert-icon.svg";

const assertionKinds = ["notNull", "shouldBe", "throws", "containSingle"] as const;

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
});

export function AssertNode({ id, data, selected }: NodeProps<BuilderNode>) {
    const nodeData = data as AssertNodeData;
    const { dispatch } = useBuilderContext();
    const styles = useStyles();

    return (
        <div className={`${styles.node} ${selected ? styles.selected : ""}`}>
            <div className={styles.header}>
                <img src={assertIcon} alt="" className={styles.icon} />
                <Text size={200} weight="semibold">Assert</Text>
            </div>

            <div className={styles.body}>
                <div className={styles.field}>
                    <Text size={100} style={{ minWidth: "55px", color: tokens.colorNeutralForeground3 }}>Kind</Text>
                    <Dropdown
                        size="small"
                        value={nodeData.assertionKind}
                        selectedOptions={[nodeData.assertionKind]}
                        onOptionSelect={(_ev, data) =>
                            dispatch({
                                type: "UPDATE_NODE",
                                payload: { id, data: { assertionKind: data.optionValue } },
                            })
                        }
                        style={{ minWidth: "120px" }}
                    >
                        {assertionKinds.map((k) => (
                            <Option key={k} value={k}>{k}</Option>
                        ))}
                    </Dropdown>
                </div>

                <div className={styles.field}>
                    <Text size={100} style={{ minWidth: "55px", color: tokens.colorNeutralForeground3 }}>Target</Text>
                    <Input
                        size="small"
                        value={nodeData.targetVar ?? ""}
                        placeholder="variable name"
                        onChange={(_ev, data) =>
                            dispatch({
                                type: "UPDATE_NODE",
                                payload: { id, data: { targetVar: data.value } },
                            })
                        }
                        style={{ flex: 1 }}
                    />
                </div>

                {(nodeData.assertionKind === "shouldBe" || nodeData.assertionKind === "containSingle") && (
                    <div className={styles.field}>
                        <Text size={100} style={{ minWidth: "55px", color: tokens.colorNeutralForeground3 }}>Expected</Text>
                        <Input
                            size="small"
                            value={nodeData.expectedValue ?? ""}
                            placeholder="expected value"
                            onChange={(_ev, data) =>
                                dispatch({
                                    type: "UPDATE_NODE",
                                    payload: { id, data: { expectedValue: data.value } },
                                })
                            }
                            style={{ flex: 1 }}
                        />
                    </div>
                )}
            </div>

            <Handle type="target" position={Position.Top} />
        </div>
    );
}
