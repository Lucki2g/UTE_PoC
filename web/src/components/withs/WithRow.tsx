import { makeStyles, tokens, Text } from "@fluentui/react-components";
import type { DslWithMutation } from "../../models";
import { ColumnLookup } from "../fields/ColumnLookup.tsx";

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

interface WithRowProps {
    dsl: DslWithMutation;
    entityName: string;
    onPathChange: (path: string) => void;
}

export function WithRow({ dsl, entityName, onPathChange }: WithRowProps) {
    const styles = useStyles();

    return (
        <div className={styles.with}>
            <Text size={100}>With</Text>
            <ColumnLookup
                entityName={entityName}
                value={dsl.path}
                onChange={onPathChange}
            />
        </div>
    );
}
