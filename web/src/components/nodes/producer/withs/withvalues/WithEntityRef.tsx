import { Combobox, makeStyles, Option } from "@fluentui/react-components";

interface IChoiceProps {
    defaultValue?: string;
    producerOptions: { key: string; label: string }[];
    onValueChange: (value: any) => void;
}

const useStyles = makeStyles({
    valueInput: {
        minWidth: "60px",
        flex: 1,
    },
});

export const WithEntityRef = ({ defaultValue, producerOptions, onValueChange }: IChoiceProps) => {
    const styles = useStyles();

    return (
        <Combobox
            size="small"
            value={defaultValue}
            selectedOptions={defaultValue ? [defaultValue] : []}
            onOptionSelect={(_ev, data) => {
                if (data.optionValue) {
                    onValueChange({
                        type: "ref",
                        ref: { kind: "binding", id: data.optionValue, member: "ToEntityReference", call: "ToEntityReference" },
                    });
                }
            }}
            placeholder="Producer..."
            className={styles.valueInput}
            positioning="below"
        >
            {producerOptions.map((opt) => (
                <Option key={opt.key} value={opt.key} text={opt.key}>
                    {opt.label}
                </Option>
            ))}
        </Combobox>
    );
}