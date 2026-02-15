import { useState, useMemo } from "react";
import {
    Combobox,
    Option,
    Spinner,
    Text,
    makeStyles,
    tokens,
} from "@fluentui/react-components";
import { useEntityColumns } from "../../hooks/useEntityColumns.ts";

const useStyles = makeStyles({
    option: {
        display: "flex",
        flexDirection: "column",
        gap: "1px",
    },
    secondary: {
        fontSize: tokens.fontSizeBase100,
        color: tokens.colorNeutralForeground4,
    },
});

interface ColumnLookupProps {
    entityName: string;
    value: string;
    onChange: (logicalName: string) => void;
}

export function ColumnLookup({ entityName, value, onChange }: ColumnLookupProps) {
    const { columns, loading } = useEntityColumns(entityName);
    const [query, setQuery] = useState("");
    const styles = useStyles();

    const filtered = useMemo(() => {
        if (!query) return columns;
        const q = query.toLowerCase();
        return columns.filter(
            (c) =>
                c.logicalName.includes(q) ||
                c.displayName?.toLowerCase().includes(q),
        );
    }, [columns, query]);

    if (loading) {
        return <Spinner size="tiny" />;
    }

    return (
        <Combobox
            size="small"
            freeform
            value={value}
            selectedOptions={value ? [value] : []}
            onOptionSelect={(_ev, data) => {
                if (data.optionValue) {
                    onChange(data.optionValue);
                    setQuery("");
                }
            }}
            onChange={(ev) => {
                setQuery(ev.target.value);
                onChange(ev.target.value);
            }}
            placeholder="Column..."
            style={{ minWidth: "100px", flex: 1 }}
        >
            {filtered.map((col) => (
                <Option key={col.logicalName} value={col.logicalName} text={col.logicalName}>
                    <div className={styles.option}>
                        <Text size={200}>{col.logicalName}</Text>
                        {col.displayName && (
                            <Text className={styles.secondary}>{col.displayName}</Text>
                        )}
                    </div>
                </Option>
            ))}
        </Combobox>
    );
}
