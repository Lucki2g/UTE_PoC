import { useMemo, useState } from "react";
import {
    Button,
    Combobox,
    Dropdown,
    Input,
    Option,
    Text,
    makeStyles,
    tokens,
} from "@fluentui/react-components";
import { DeleteRegular, LinkRegular, TextCaseTitleRegular } from "@fluentui/react-icons";
import type { WhereEntry } from "../../../../models/builder.ts";
import type { DslValueExpression } from "../../../../models/dsl.ts";
import type { ProducerNodeData } from "../../../../models/builder.ts";
import type { EntityColumnInfo } from "../../../../services/entitySchemaService.ts";
import { useEntityColumns } from "../../../../hooks/useEntityColumns.ts";
import { ColumnLookup } from "../../../fields/ColumnLookup.tsx";

const useStyles = makeStyles({
    row: {
        display: "flex",
        alignItems: "center",
        gap: tokens.spacingHorizontalXS,
        padding: `${tokens.spacingVerticalXS} ${tokens.spacingHorizontalS}`,
        backgroundColor: tokens.colorPaletteBlueBackground1,
        border: `1px solid ${tokens.colorNeutralStroke2}`,
    },
    label: {
        flexShrink: 0,
        color: tokens.colorNeutralForeground3,
    },
    deleteBtn: {
        flexShrink: 0,
        cursor: "pointer",
        color: tokens.colorNeutralForeground3,
        fontSize: "14px",
        "&:hover": { color: tokens.colorStatusDangerForeground1 },
    },
});

const operators = ["==", "!=", "<", "<=", ">", ">="] as const;
const refMembers = ["Id", "Name"] as const;

interface WhereRowProps {
    entry: WhereEntry;
    entityName: string;
    previousProducers: ProducerNodeData[];
    onChange: (updated: WhereEntry) => void;
    onDelete: () => void;
}

function getColumnCategory(col: EntityColumnInfo | undefined): "entityref" | "enum" | "text" {
    if (!col) return "text";
    const t = col.dataType.replace("?", "").trim();
    if (t === "EntityReference") return "entityref";
    if (col.enumMembers && col.enumMembers.length > 0) return "enum";
    return "text";
}

function getDisplayValue(value: DslValueExpression): string {
    switch (value.type) {
        case "string":        return value.value;
        case "number":        return String(value.value);
        case "boolean":       return String(value.value);
        case "guid":          return value.value;
        case "null":          return "";
        case "enum":          return value.member;
        case "enumNumber":    return String(value.value);
        case "interpolation": return value.template;
        case "ref":           return value.ref.id ?? "";
    }
}

export function WhereRow({ entry, entityName, previousProducers, onChange, onDelete }: WhereRowProps) {
    const styles = useStyles();
    const { columns } = useEntityColumns(entityName);

    const columnInfo = useMemo(
        () => columns.find((c) => c.propertyName === entry.column),
        [columns, entry.column],
    );

    const columnCategory = getColumnCategory(columnInfo);

    // For "text" columns, track whether the user wants to compare against a producer ref or a literal.
    // Default to "ref" mode when the current value is already a ref.
    const [textMode, setTextMode] = useState<"literal" | "ref">(
        () => entry.value.type === "ref" ? "ref" : "literal",
    );

    const producerOptions = useMemo(
        () => previousProducers.map((p) => ({
            key: p.variableName,
            label: `${p.variableName} (${p.draftId})`,
        })),
        [previousProducers],
    );

    // For ref-based editors: current producer id and member
    const selectedRefId  = entry.value.type === "ref" ? (entry.value.ref.id ?? "")    : "";
    const selectedMember = entry.value.type === "ref" ? (entry.value.ref.member ?? "Id") : "Id";

    const renderRefPicker = (members: readonly string[]) => (
        <>
            <Combobox
                size="small"
                value={selectedRefId}
                selectedOptions={selectedRefId ? [selectedRefId] : []}
                onOptionSelect={(_ev, data) => {
                    if (data.optionValue)
                        onChange({
                            ...entry,
                            value: { type: "ref", ref: { kind: "bindingVar", id: data.optionValue, member: selectedMember } },
                        });
                }}
                placeholder="Producer..."
                style={{ flex: 1, minWidth: "60px" }}
                positioning="below"
            >
                {producerOptions.map((opt) => (
                    <Option key={opt.key} value={opt.key}>{opt.label}</Option>
                ))}
            </Combobox>
            <Dropdown
                size="small"
                value={selectedMember}
                selectedOptions={[selectedMember]}
                onOptionSelect={(_ev, data) => {
                    if (data.optionValue)
                        onChange({
                            ...entry,
                            value: { type: "ref", ref: { kind: "bindingVar", id: selectedRefId, member: data.optionValue } },
                        });
                }}
                style={{ minWidth: "55px" }}
            >
                {members.map((m) => (
                    <Option key={m} value={m}>{m}</Option>
                ))}
            </Dropdown>
        </>
    );

    const renderValueEditor = () => {
        switch (columnCategory) {
            case "enum": {
                const enumType = columnInfo!.dataType.replace("?", "").trim();
                const members  = columnInfo!.enumMembers!;
                const selected = entry.value.type === "enum" ? entry.value.member : "";
                return (
                    <Combobox
                        size="small"
                        value={selected}
                        selectedOptions={selected ? [selected] : []}
                        onOptionSelect={(_ev, data) => {
                            if (data.optionValue)
                                onChange({ ...entry, value: { type: "enum", enumType, member: data.optionValue } });
                        }}
                        placeholder="Select..."
                        style={{ flex: 1, minWidth: "60px" }}
                        positioning="below"
                    >
                        {members.map((m) => (
                            <Option key={m} value={m}>{m}</Option>
                        ))}
                    </Combobox>
                );
            }

            case "entityref":
                // EntityReference columns always use producer ref (.Id / .Name)
                return renderRefPicker(refMembers);

            default: {
                // Text / Guid columns: toggle between literal and producer ref (.Id)
                const isRef = textMode === "ref";
                return (
                    <>
                        {isRef
                            ? renderRefPicker(["Id"])
                            : (
                                <Input
                                    size="small"
                                    value={getDisplayValue(entry.value)}
                                    onChange={(_ev, data) =>
                                        onChange({ ...entry, value: { type: "string", value: data.value } })
                                    }
                                    placeholder="value"
                                    style={{ flex: 1, minWidth: "60px" }}
                                />
                            )
                        }
                        <Button
                            size="small"
                            appearance="subtle"
                            icon={isRef ? <TextCaseTitleRegular /> : <LinkRegular />}
                            title={isRef ? "Switch to literal value" : "Switch to producer ref"}
                            onClick={() => {
                                const next = isRef ? "literal" : "ref";
                                setTextMode(next);
                                // Reset value to blank of the new mode
                                onChange({
                                    ...entry,
                                    value: next === "ref"
                                        ? { type: "ref", ref: { kind: "bindingVar", id: "", member: "Id" } }
                                        : { type: "string", value: "" },
                                });
                            }}
                            style={{ flexShrink: 0 }}
                        />
                    </>
                );
            }
        }
    };

    return (
        <div className={styles.row}>
            <Text size={100} className={styles.label}>Where</Text>
            <ColumnLookup
                entityName={entityName}
                value={entry.column}
                onChange={(col) => onChange({ ...entry, column: col })}
            />
            <Dropdown
                size="small"
                value={entry.operator || "=="}
                selectedOptions={[entry.operator || "=="]}
                onOptionSelect={(_ev, data) => onChange({ ...entry, operator: data.optionValue ?? "==" })}
                style={{ minWidth: "55px" }}
            >
                {operators.map((op) => (
                    <Option key={op} value={op}>{op}</Option>
                ))}
            </Dropdown>
            {renderValueEditor()}
            <DeleteRegular
                className={styles.deleteBtn}
                onClick={onDelete}
            />
        </div>
    );
}
