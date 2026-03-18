import { useState, useMemo, useEffect } from "react";
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
    // inputText drives what is shown in the combobox input. It is kept in sync with the
    // committed `value` prop but diverges while the user is typing a search query.
    const [inputText, setInputText] = useState(value);
    const styles = useStyles();

    // When the committed value changes from outside, sync the displayed text.
    useEffect(() => {
        setInputText(value);
    }, [value]);

    // Only filter when the user is actively typing (inputText differs from committed value)
    const isSearching = inputText !== value;
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
        if (!isSearching || !inputText) return base;
        const q = inputText.toLowerCase();
        return base.filter(
            (c) =>
                c.logicalName.includes(q) ||
                c.propertyName.toLowerCase().includes(q) ||
                c.displayName?.toLowerCase().includes(q),
        );
    }, [columns, inputText, isSearching, filterDataType]);

    if (loading) {
        return <Spinner size="tiny" />;
    }

    return (
        <Combobox
            size="small"
            freeform
            value={inputText}
            selectedOptions={value ? [value] : []}
            onOptionSelect={(_ev, data) => {
                if (data.optionValue && data.optionValue !== value) {
                    onChange(data.optionValue);
                    setInputText(data.optionValue);
                } else if (data.optionValue) {
                    // Re-selection of already-committed value — just sync display text
                    setInputText(data.optionValue);
                }
            }}
            onChange={(ev) => {
                // Only update local search text — never propagate partial input to the store
                setInputText(ev.target.value);
            }}
            onBlur={() => {
                // Restore displayed text to the committed value if user didn't pick an option
                setInputText(value);
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
