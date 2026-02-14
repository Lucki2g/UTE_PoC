import { useEffect } from "react";
import {
    Text,
    Spinner,
    Badge,
    Toolbar,
    tokens,
    makeStyles,
} from "@fluentui/react-components";
import { useGit } from "../hooks/useGit.ts";
import { useMetadata } from "../hooks/useMetadata.ts";
import bannerIcon from "../assets/testengine-banner-icon.svg";

const useStyles = makeStyles({
    header: {
        height: "48px",
        minHeight: "48px",
        backgroundColor: tokens.colorBrandBackground,
        color: tokens.colorNeutralForegroundOnBrand,
        display: "flex",
        alignItems: "center",
        paddingLeft: tokens.spacingHorizontalL,
        paddingRight: tokens.spacingHorizontalL,
        gap: tokens.spacingHorizontalM,
        boxShadow: tokens.shadow4,
        zIndex: 100,
    },
    brand: {
        display: "flex",
        alignItems: "center",
        gap: tokens.spacingHorizontalS,
    },
    brandIcon: {
        height: "28px",
        width: "auto",
    },
    status: {
        display: "flex",
        alignItems: "center",
        gap: tokens.spacingHorizontalS,
        marginLeft: "auto",
    },
});

export function Header() {
    const git = useGit();
    const metadata = useMetadata();
    const styles = useStyles();

    useEffect(() => {
        git.fetchStatus();
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    const status = git.status;

    return (
        <header className={styles.header}>
            <div className={styles.brand}>
                <img src={bannerIcon} alt="TestEngine" className={styles.brandIcon} />
                <Text weight="semibold" size={400}>TestEngine</Text>
            </div>

            <Toolbar className={styles.status}>
                {git.loading && <Spinner size="tiny" appearance="inverted" />}

                {status?.cloned && (
                    <>
                        <Text size={200}>{status.branch ?? "no branch"}</Text>
                        <Badge
                            size="small"
                            color={status.clean ? "success" : "warning"}
                            appearance="filled"
                        >
                            {status.clean ? "Clean" : `${status.changedFiles ?? 0} changes`}
                        </Badge>
                    </>
                )}

                {!status?.cloned && !git.loading && (
                    <Text size={200}>Not cloned</Text>
                )}

                {metadata.syncing && (
                    <>
                        <Spinner size="tiny" appearance="inverted" />
                        <Text size={200}>Syncing metadata...</Text>
                    </>
                )}
            </Toolbar>
        </header>
    );
}
