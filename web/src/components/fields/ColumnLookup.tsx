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
    combobox: {
        minWidth: "80px",
    },
    listbox: {
        maxHeight: "200px",
    },
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
    /** Current value — holds the C# property name (e.g. "Ape_Name"). */
    value: string;
    /** Called with the C# property name of the selected column. */
    onChange: (propertyName: string) => void;
    /** When set, only columns whose dataType or targetEntity matches this value are shown. */
    filterDataType?: string;
}

export function ColumnLookup({ entityName, value, onChange, filterDataType }: ColumnLookupProps) {
    const { columns, loading } = useEntityColumns(entityName);
    const [query, setQuery] = useState("");
    const styles = useStyles();

    const filtered = useMemo(() => {
        let base = columns;
        if (filterDataType) {
            const ft = filterDataType.toLowerCase();
            base = base.filter(
                (c) =>
                    c.dataType.replace("?", "").trim().toLowerCase() === ft ||
                    c.targetEntity?.toLowerCase() === ft,
            );
        }
        if (!query) return base;
        const q = query.toLowerCase();
        return base.filter(
            (c) =>
                c.logicalName.includes(q) ||
                c.propertyName.toLowerCase().includes(q) ||
                c.displayName?.toLowerCase().includes(q),
        );
    }, [columns, query, filterDataType]);

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
            className={styles.combobox}
            listbox={{ className: styles.listbox }}
            positioning="below"
            style={{ flex: 1 }}
        >
            {filtered.map((col) => (
                <Option key={col.propertyName} value={col.propertyName} text={col.propertyName}>
                    <div className={styles.option}>
                        <Text size={200}>{col.logicalName}</Text>
                        {col.propertyName !== col.logicalName && (
                            <Text className={styles.secondary}>{col.propertyName}</Text>
                        )}
                        {col.displayName && (
                            <Text className={styles.secondary}>{col.displayName}</Text>
                        )}
                    </div>
                </Option>
            ))}
        </Combobox>
    );
}
