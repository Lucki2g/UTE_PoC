import { Handle, Position, type NodeProps } from "@xyflow/react";
import {
    Input,
    Switch,
    Text,
    makeStyles,
    tokens,
} from "@fluentui/react-components";
import type { BuilderNode, ProducerNodeData } from "../../models/builder.ts";
import { useBuilderContext } from "../../contexts/BuilderContext.tsx";
import dataproducerIcon from "../../assets/dataproducer-icon.svg";
import { WithRow } from "../withs/WithRow.tsx";

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
    const { dispatch } = useBuilderContext();
    const styles = useStyles();

    return (
        <div className={`${styles.node} ${selected ? styles.selected : ""}`}>
            <div className={styles.header}>
                <img src={dataproducerIcon} alt="" className={styles.icon} />
                <Text size={200} weight="semibold">{nodeData.draftId ?? nodeData.entityName}</Text>
            </div>

            <div className={styles.body}>
                {/* FIELDS */}
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

                {/* WITHS */}
                {nodeData.withMutations.length > 0 && (
                    <div className={styles.section}>
                        {nodeData.withMutations.map((m, i) => (
                            <WithRow key={i} dsl={m} />
                        ))}
                    </div>
                )}
            </div>

            {/* FOOTER */}
            <div className={styles.footer}>
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
            </div>

            <Handle type="source" position={Position.Bottom} />
            <Handle type="target" position={Position.Top} />
        </div>
    );
}
