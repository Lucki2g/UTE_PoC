import { useState, useCallback, type DragEvent } from "react";
import { type NodeProps } from "@xyflow/react";
import { makeStyles, tokens } from "@fluentui/react-components";
import { AddRegular } from "@fluentui/react-icons";

export interface DropZoneNodeData {
    nodeType: "dropZone";
    insertionIndex: number;
    onDropAtIndex: (index: number, e: DragEvent) => void;
    [key: string]: unknown;
}

const useStyles = makeStyles({
    zone: {
        width: "200px",
        height: "40px",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        borderRadius: tokens.borderRadiusMedium,
        border: `2px dashed ${tokens.colorNeutralStroke2}`,
        backgroundColor: tokens.colorNeutralBackground1,
        opacity: 0.7,
        transitionProperty: "border-color, background-color, opacity",
        transitionDuration: tokens.durationNormal,
        cursor: "default",
    },
    zoneActive: {
        borderColor: tokens.colorBrandStroke1 as string as never,
        backgroundColor: tokens.colorBrandBackground2 as string as never,
        opacity: 1,
    },
});

export function DropZoneNode({ data }: NodeProps) {
    const d = data as unknown as DropZoneNodeData;
    const styles = useStyles();
    const [dragOver, setDragOver] = useState(false);

    const handleDragOver = useCallback((e: DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        e.dataTransfer.dropEffect = "copy";
        setDragOver(true);
    }, []);

    const handleDragLeave = useCallback(() => {
        setDragOver(false);
    }, []);

    const handleDrop = useCallback(
        (e: DragEvent) => {
            e.preventDefault();
            e.stopPropagation();
            setDragOver(false);
            d.onDropAtIndex(d.insertionIndex, e);
        },
        [d],
    );

    return (
        <div
            className={`${styles.zone} ${dragOver ? styles.zoneActive : ""}`}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
        >
            <AddRegular
                fontSize={16}
                style={{ color: dragOver ? tokens.colorBrandForeground1 : tokens.colorNeutralForeground4 }}
            />
        </div>
    );
}
