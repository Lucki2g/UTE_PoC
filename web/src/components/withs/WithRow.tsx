import { makeStyles, tokens, Text, Input } from "@fluentui/react-components";
import type { DslWithMutation } from "../../models";


const useStyles = makeStyles({
    with: {
        display: "flex",
        alignItems: "center",
        gap: tokens.spacingHorizontalXS,
        padding: `${tokens.spacingVerticalXS} ${tokens.spacingHorizontalS}`,
        backgroundColor: tokens.colorPaletteYellowBackground1,
        border: `1px solid ${tokens.colorNeutralStroke2}`,
    }
});

export function WithRow({ dsl }: { dsl: DslWithMutation }) {
    const styles = useStyles();

    return (
        <div className={styles.with}>
            <Text size={100}>With</Text>
            <Input size="small" />
        </div>
    );
}