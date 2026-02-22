import { type NodeProps } from "@xyflow/react";
import { makeStyles, tokens } from "@fluentui/react-components";
import { AddRegular } from "@fluentui/react-icons";

export interface DropZoneNodeData {
    nodeType: "dropZone";
    insertionIndex: number;
    [key: string]: unknown;
}

const useStyles = makeStyles({
    zone: {
        width: "280px",
        height: "40px",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        borderRadius: tokens.borderRadiusMedium,
        border: `2px dashed ${tokens.colorNeutralStroke2}`,
        backgroundColor: tokens.colorNeutralBackground1,
        opacity: 0.7,
        cursor: "default",
        pointerEvents: "none",
    },
});

export function DropZoneNode({ data }: NodeProps) {
    const d = data as unknown as DropZoneNodeData;
    void d;
    const styles = useStyles();

    return (
        <div className={styles.zone}>
            <AddRegular
                fontSize={16}
                style={{ color: tokens.colorNeutralForeground4 }}
            />
        </div>
    );
}
