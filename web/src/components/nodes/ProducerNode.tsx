import { Handle, Position, type NodeProps } from "@xyflow/react";
import {
    Input,
    Checkbox,
    Text,
    makeStyles,
    tokens,
} from "@fluentui/react-components";
import type { BuilderNode, ProducerNodeData } from "../../models/builder.ts";
import { useBuilderContext } from "../../contexts/BuilderContext.tsx";
import dataproducerIcon from "../../assets/dataproducer-icon.svg";

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
        backgroundColor: tokens.colorPaletteLightTealBackground2,
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

export function ProducerNode({ id, data, selected }: NodeProps<BuilderNode>) {
    const nodeData = data as ProducerNodeData;
    const { dispatch } = useBuilderContext();
    const styles = useStyles();

    return (
        <div className={`${styles.node} ${selected ? styles.selected : ""}`}>
            <div className={styles.header}>
                <img src={dataproducerIcon} alt="" className={styles.icon} />
                <Text size={200} weight="semibold">Draft&lt;{nodeData.entityName}&gt;</Text>
            </div>

            <div className={styles.body}>
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

                <div className={styles.field}>
                    <Checkbox
                        label="Build"
                        size="medium"
                        checked={nodeData.build}
                        onChange={(_ev, data) =>
                            dispatch({
                                type: "UPDATE_NODE",
                                payload: { id, data: { build: !!data.checked } },
                            })
                        }
                    />
                </div>

                {nodeData.withMutations.length > 0 && (
                    <div className={styles.section}>
                        <Text size={100} style={{ color: tokens.colorNeutralForeground3 }}>With</Text>
                        {nodeData.withMutations.map((m, i) => (
                            <div key={i} className={styles.withRow}>
                                <Text size={100} style={{ color: tokens.colorBrandForeground1 }}>{m.path}</Text>
                                <Text size={100} style={{ color: tokens.colorNeutralForeground4 }}>=</Text>
                                <Text size={100}>
                                    {"value" in m.value ? String(m.value.value) : m.value.type}
                                </Text>
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
