import { useEffect, useState } from "react";
import {
    Text,
    Spinner,
    Badge,
    Button,
    Tooltip,
    Dialog,
    DialogSurface,
    DialogBody,
    DialogTitle,
    DialogContent,
    DialogActions,
    Field,
    Input,
    Textarea,
    ProgressBar,
    tokens,
    makeStyles,
} from "@fluentui/react-components";
import type { SyncPhase } from "../contexts/MetadataContext.tsx";
import { useGit } from "../hooks/useGit.ts";
import { useMetadata } from "../hooks/useMetadata.ts";
import { GitBranch, GitLoop, GitPush, GitPullReques } from "../util/icons.tsx";
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
    actions: {
        display: "flex",
        alignItems: "center",
        gap: tokens.spacingHorizontalS,
        marginLeft: "auto",
    },
    branchInfo: {
        display: "flex",
        alignItems: "center",
        gap: tokens.spacingHorizontalXS,
        color: tokens.colorNeutralForegroundOnBrand,
    },
    iconBtn: {
        color: tokens.colorNeutralForegroundOnBrand,
        minWidth: "unset",
        padding: `0 ${tokens.spacingHorizontalS}`,
        height: "32px",
        display: "flex",
        alignItems: "center",
        gap: tokens.spacingHorizontalXS,
        backgroundColor: "transparent",
        border: `1px solid transparent`,
        borderRadius: tokens.borderRadiusMedium,
        cursor: "pointer",
        "&:hover": {
            backgroundColor: tokens.colorBrandBackgroundHover,
            borderColor: tokens.colorNeutralForegroundOnBrand,
        },
    },
    svgIcon: {
        display: "flex",
        alignItems: "center",
        width: "16px",
        height: "16px",
        flexShrink: 0,
    },
    outgoingBadge: {
        backgroundColor: tokens.colorPaletteRedBackground3,
        color: tokens.colorNeutralForegroundOnBrand,
        borderRadius: tokens.borderRadiusCircular,
        padding: `0 ${tokens.spacingHorizontalXS}`,
        fontSize: tokens.fontSizeBase100,
        fontWeight: tokens.fontWeightSemibold,
        minWidth: "18px",
        textAlign: "center",
        lineHeight: "18px",
    },
    divider: {
        width: "1px",
        height: "20px",
        backgroundColor: tokens.colorNeutralForegroundOnBrand,
        opacity: 0.3,
        margin: `0 ${tokens.spacingHorizontalXS}`,
    },
});

const phaseLabels: Record<NonNullable<SyncPhase>, { label: string; step: number }> = {
    xrmContext: { label: "Generating C# entity classes", step: 1 },
    metadata: { label: "Generating TypeScript metadata", step: 2 },
    workflows: { label: "Downloading workflow files", step: 3 },
};

function SyncProgress({
    syncing,
    syncPhase,
    syncMessage,
    syncError,
    lastSynced,
}: {
    syncing: boolean;
    syncPhase: SyncPhase;
    syncMessage: string | null;
    syncError: string | null;
    lastSynced: string | null;
}) {
    // Nothing has run yet
    if (!syncing && !syncPhase && !lastSynced && !syncError) {
        return (
            <Text style={{ color: tokens.colorNeutralForeground3 }}>
                Ready to sync. Click "Sync Metadata" to start.
            </Text>
        );
    }

    const step = syncPhase ? (phaseLabels[syncPhase]?.step ?? 0) : 0;
    // After completion, all phases are done. During sync, phases before current are done.
    const allDone = !syncing && !syncError && !!lastSynced;

    return (
        <div style={{ display: "flex", flexDirection: "column", gap: tokens.spacingVerticalM }}>
            {(["xrmContext", "metadata", "workflows"] as NonNullable<SyncPhase>[]).map((phase) => {
                const info = phaseLabels[phase];
                const phaseStep = info.step;
                const isActive = syncing && step === phaseStep;
                const isFailed = !!syncError && step === phaseStep;
                const isDone = allDone || (!isFailed && step > phaseStep);
                const isPending = !isActive && !isFailed && !isDone;

                return (
                    <div key={phase} style={{ display: "flex", flexDirection: "column", gap: tokens.spacingVerticalXS }}>
                        <div style={{ display: "flex", alignItems: "center", gap: tokens.spacingHorizontalS }}>
                            {isActive && <Spinner size="extra-tiny" />}
                            {isFailed && (
                                <span style={{ color: tokens.colorPaletteRedForeground1, fontWeight: tokens.fontWeightSemibold, fontSize: "12px" }}>✕</span>
                            )}
                            {isDone && (
                                <span style={{ color: tokens.colorPaletteGreenForeground1, fontWeight: tokens.fontWeightSemibold, fontSize: "12px" }}>✓</span>
                            )}
                            {isPending && (
                                <span style={{ width: "12px", display: "inline-block" }} />
                            )}
                            <Text
                                size={200}
                                style={{
                                    color: isFailed
                                        ? tokens.colorPaletteRedForeground1
                                        : isActive
                                            ? tokens.colorNeutralForeground1
                                            : isDone
                                                ? tokens.colorNeutralForeground3
                                                : tokens.colorNeutralForegroundDisabled,
                                    fontWeight: isActive ? tokens.fontWeightSemibold : tokens.fontWeightRegular,
                                }}
                            >
                                {info.label}
                            </Text>
                        </div>
                        {isActive && <ProgressBar />}
                        {isFailed && syncError && (
                            <Text size={100} style={{ color: tokens.colorPaletteRedForeground1, marginLeft: "20px" }}>
                                {syncError}
                            </Text>
                        )}
                    </div>
                );
            })}
            {syncing && syncMessage && (
                <Text size={100} style={{ color: tokens.colorNeutralForeground3, fontStyle: "italic" }}>
                    {syncMessage}
                </Text>
            )}
        </div>
    );
}

export function Header() {
    const git = useGit();
    const metadata = useMetadata();
    const styles = useStyles();

    const [syncDialogOpen, setSyncDialogOpen] = useState(false);

    const [prDialogOpen, setPrDialogOpen] = useState(false);
    const [prTitle, setPrTitle] = useState("");
    const [prDescription, setPrDescription] = useState("");
    const [prTarget, setPrTarget] = useState("main");
    const [prSubmitting, setPrSubmitting] = useState(false);
    const [prUrl, setPrUrl] = useState<string | null>(null);

    useEffect(() => {
        git.fetchStatus();
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    const status = git.status;
    const outgoing = status?.outgoingCommits ?? 0;

    const handlePublishAll = async () => {
        await git.publish();
    };

    const handleSyncMetadata = async () => {
        metadata.clearError();
        setSyncDialogOpen(true);
        await metadata.sync();
    };

    const handleOpenPr = async () => {
        if (!prTitle.trim()) return;
        setPrSubmitting(true);
        try {
            const url = await git.submit({ targetBranch: prTarget, title: prTitle, description: prDescription });
            if (url) {
                setPrUrl(url);
                window.open(url, "_blank", "noopener,noreferrer");
            }
        } finally {
            setPrSubmitting(false);
        }
    };

    const handleClosePrDialog = () => {
        setPrDialogOpen(false);
        setPrTitle("");
        setPrDescription("");
        setPrTarget("main");
        setPrUrl(null);
    };

    return (
        <header className={styles.header}>
            <div className={styles.brand}>
                <img src={bannerIcon} alt="TestEngine" className={styles.brandIcon} />
            </div>

            <div className={styles.actions}>
                {git.loading && <Spinner size="tiny" appearance="inverted" />}

                {/* Branch name */}
                {status?.cloned && (
                    <div className={styles.branchInfo}>
                        <span className={styles.svgIcon}>{GitBranch}</span>
                        <Text size={200}>{status.branch ?? "no branch"}</Text>
                        <Badge
                            size="small"
                            color={status.clean ? "success" : "warning"}
                            appearance="filled"
                        >
                            {status.clean ? "Clean" : `${status.changedFiles ?? 0} changes`}
                        </Badge>
                    </div>
                )}

                {!status?.cloned && !git.loading && (
                    <Text size={200}>Not cloned</Text>
                )}

                {status?.cloned && (
                    <>
                        <div className={styles.divider} />

                        {/* Outgoing commits + Publish All */}
                        <Tooltip content="Push all committed changes to remote" relationship="label">
                            <button
                                className={styles.iconBtn}
                                onClick={handlePublishAll}
                                disabled={git.loading || outgoing === 0}
                                aria-label="Publish all commits"
                            >
                                <span className={styles.svgIcon}>{GitPush}</span>
                                {outgoing > 0 && (
                                    <span className={styles.outgoingBadge}>{outgoing}</span>
                                )}
                                <Text size={200} style={{ color: "inherit" }}>Publish</Text>
                            </button>
                        </Tooltip>

                        {/* Sync Metadata */}
                        <Tooltip content="Sync Dataverse metadata (XrmContext + MetadataGenerator)" relationship="label">
                            <button
                                className={styles.iconBtn}
                                onClick={handleSyncMetadata}
                                disabled={metadata.syncing}
                                aria-label="Sync metadata"
                            >
                                <span className={styles.svgIcon}>{GitLoop}</span>
                                <Text size={200} style={{ color: "inherit" }}>Sync Metadata</Text>
                            </button>
                        </Tooltip>

                        {/* Open Pull Request */}
                        <Tooltip content="Open a pull request for the current branch" relationship="label">
                            <button
                                className={styles.iconBtn}
                                onClick={() => setPrDialogOpen(true)}
                                aria-label="Open pull request"
                            >
                                <span className={styles.svgIcon}>{GitPullReques}</span>
                                <Text size={200} style={{ color: "inherit" }}>Open PR</Text>
                            </button>
                        </Tooltip>
                    </>
                )}
            </div>

            {/* Sync Metadata dialog */}
            <Dialog open={syncDialogOpen} onOpenChange={(_e, data) => { if (!data.open && !metadata.syncing) setSyncDialogOpen(false); }}>
                <DialogSurface style={{ minWidth: "420px" }}>
                    <DialogBody>
                        <DialogTitle>Sync Metadata</DialogTitle>
                        <DialogContent>
                            <SyncProgress
                                syncing={metadata.syncing}
                                syncPhase={metadata.syncPhase}
                                syncMessage={metadata.syncMessage}
                                syncError={metadata.syncError}
                                lastSynced={metadata.lastSynced}
                            />
                        </DialogContent>
                        <DialogActions>
                            <Button
                                appearance="secondary"
                                onClick={() => setSyncDialogOpen(false)}
                                disabled={metadata.syncing}
                            >
                                Close
                            </Button>
                            {(metadata.syncError || (!metadata.syncing && metadata.lastSynced == null)) && (
                                <Button appearance="primary" onClick={handleSyncMetadata}>
                                    Retry
                                </Button>
                            )}
                        </DialogActions>
                    </DialogBody>
                </DialogSurface>
            </Dialog>

            {/* Pull Request dialog */}
            <Dialog open={prDialogOpen} onOpenChange={(_e, data) => { if (!data.open) handleClosePrDialog(); }}>
                <DialogSurface>
                    <DialogBody>
                        <DialogTitle>Open Pull Request</DialogTitle>
                        <DialogContent style={{ display: "flex", flexDirection: "column", gap: tokens.spacingVerticalM }}>
                            {prUrl ? (
                                <Text>
                                    Pull request created! <a href={prUrl} target="_blank" rel="noopener noreferrer">{prUrl}</a>
                                </Text>
                            ) : (
                                <>
                                    <Text size={200} style={{ color: tokens.colorNeutralForeground3 }}>
                                        Current branch: <strong>{status?.branch ?? "unknown"}</strong>
                                    </Text>
                                    <Field label="Target branch" required>
                                        <Input
                                            value={prTarget}
                                            onChange={(_ev, data) => setPrTarget(data.value)}
                                            placeholder="main"
                                        />
                                    </Field>
                                    <Field label="Title" required>
                                        <Input
                                            value={prTitle}
                                            onChange={(_ev, data) => setPrTitle(data.value)}
                                            placeholder="e.g. feat: add account tests"
                                        />
                                    </Field>
                                    <Field label="Description">
                                        <Textarea
                                            value={prDescription}
                                            onChange={(_ev, data) => setPrDescription(data.value)}
                                            placeholder="Optional description..."
                                            rows={4}
                                        />
                                    </Field>
                                </>
                            )}
                        </DialogContent>
                        <DialogActions>
                            <Button appearance="secondary" onClick={handleClosePrDialog}>
                                {prUrl ? "Close" : "Cancel"}
                            </Button>
                            {!prUrl && (
                                <Button
                                    appearance="primary"
                                    onClick={handleOpenPr}
                                    disabled={!prTitle.trim() || !prTarget.trim() || prSubmitting}
                                >
                                    {prSubmitting ? "Creating..." : "Create PR"}
                                </Button>
                            )}
                        </DialogActions>
                    </DialogBody>
                </DialogSurface>
            </Dialog>
        </header>
    );
}
