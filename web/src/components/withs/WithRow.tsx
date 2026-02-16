import { useMemo } from "react";
import {
    Input,
    Text,
    makeStyles,
    tokens,
} from "@fluentui/react-components";
import type { DslWithMutation, DslValueExpression } from "../../models";
import type { ProducerNodeData } from "../../models/builder.ts";
import type { EntityColumnInfo } from "../../services/entitySchemaService.ts";
import { useEntityColumns } from "../../hooks/useEntityColumns.ts";
import { ColumnLookup } from "../fields/ColumnLookup.tsx";
import { WithChoice } from "./withvalues/WithChoice.tsx";
import { WithEntityRef } from "./withvalues/WithEntityRef.tsx";

const useStyles = makeStyles({
    with: {
        display: "flex",
        alignItems: "center",
        gap: tokens.spacingHorizontalXS,
        padding: `${tokens.spacingVerticalXS} ${tokens.spacingHorizontalS}`,
        backgroundColor: tokens.colorPaletteYellowBackground1,
        border: `1px solid ${tokens.colorNeutralStroke2}`,
    },
    equals: {
        fontWeight: tokens.fontWeightSemibold,
        flexShrink: 0,
    },
    valueInput: {
        minWidth: "60px",
        flex: 1,
    },
});

interface WithRowProps {
    dsl: DslWithMutation;
    entityName: string;
    previousProducers: ProducerNodeData[];
    onPathChange: (path: string) => void;
    onValueChange: (value: DslValueExpression) => void;
}

function getValueCategory(col: EntityColumnInfo | undefined): "text" | "enum" | "entityref" {
    if (!col) return "text";
    const t = col.dataType.replace("?", "").trim();
    if (t === "EntityReference") return "entityref";
    if (col.enumMembers && col.enumMembers.length > 0) return "enum";
    return "text";
}

function getDisplayValue(value: DslValueExpression): string {
    switch (value.type) {
        case "string": return value.value;
        case "number": return String(value.value);
        case "boolean": return String(value.value);
        case "guid": return value.value;
        case "null": return "";
        case "enum": return value.member;
        case "enumNumber": return String(value.value);
        case "interpolation": return value.template;
        case "ref": return value.ref.id ?? "";
    }
}

export function WithRow({
    dsl,
    entityName,
    previousProducers,
    onPathChange,
    onValueChange,
}: WithRowProps) {
    const styles = useStyles();
    const { columns } = useEntityColumns(entityName);

    // Resolve column info from the loaded schema using dsl.path
    const columnInfo = useMemo(
        () => columns.find((c) => c.logicalName === dsl.path),
        [columns, dsl.path],
    );

    const category = getValueCategory(columnInfo);

    const producerOptions = useMemo(
        () => previousProducers.map((p) => ({
            key: p.variableName,
            label: `${p.variableName} (${p.draftId})`,
        })),
        [previousProducers],
    );

    const renderValueEditor = () => {
        switch (category) {
            case "entityref":
                const selectedMember = dsl.value.type === "ref" ? dsl.value.ref.id : "";
                return <WithEntityRef defaultValue={selectedMember} producerOptions={producerOptions} onValueChange={onValueChange} />;
            case "enum": {
                const selectedMember = dsl.value.type === "ref" ? dsl.value.ref.member : "";
                return <WithChoice defaultValue={selectedMember} columnInfo={columnInfo!} onValueChange={onValueChange} />;
            }
            default:
                return (
                    <Input
                        size="small"
                        value={getDisplayValue(dsl.value)}
                        onChange={(_ev, data) =>
                            onValueChange({ type: "string", value: data.value })
                        }
                        placeholder="Value..."
                        className={styles.valueInput}
                    />
                );
        }
    };

    return (
        <div className={styles.with}>
            <Text size={100}>With</Text>
            <ColumnLookup
                entityName={entityName}
                value={dsl.path}
                onChange={onPathChange}
            />
            <Text size={100} className={styles.equals}>=</Text>
            {renderValueEditor()}
        </div>
    );
}
