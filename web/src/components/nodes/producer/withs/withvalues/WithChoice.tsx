import { Combobox, makeStyles, Option } from "@fluentui/react-components";
import type { EntityColumnInfo } from "../../../../../services";

interface IChoiceProps {
    defaultValue?: string;
    columnInfo: EntityColumnInfo;
    onValueChange: (value: any) => void;
}

const useStyles = makeStyles({
    valueInput: {
        minWidth: "60px",
        flex: 1,
    },
});

export const WithChoice = ({ defaultValue, columnInfo, onValueChange }: IChoiceProps) => {

    const styles = useStyles();

    function getEnumType(col: EntityColumnInfo): string {
        return col.dataType.replace("?", "").trim();
    }

    const enumType = getEnumType(columnInfo!);
    const members = columnInfo!.enumMembers!;
    return (
        <Combobox
            size="small"
            value={defaultValue}
            selectedOptions={defaultValue ? [defaultValue] : []}
            onOptionSelect={(_ev, data) => {
                if (data.optionValue) {
                    onValueChange({
                        type: "enum",
                        enumType,
                        member: data.optionValue,
                    });
                }
            }}
            placeholder="Select..."
            className={styles.valueInput}
            positioning="below"
        >
            {members.map((m) => (
                <Option key={m} value={m} text={m}>
                    {m}
                </Option>
            ))}
        </Combobox>
    );
}