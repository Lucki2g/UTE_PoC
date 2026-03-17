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
    Menu,
    MenuTrigger,
    MenuPopover,
    MenuList,
    MenuItem,
    tokens,
    makeStyles,
} from "@fluentui/react-components";
import type { SyncPhase } from "../contexts/MetadataContext.tsx";
import { useProducerContext, useTestContext, useBuilderContext } from "../contexts/index.ts";
import { useGit } from "../hooks/useGit.ts";
import { useMetadata } from "../hooks/useMetadata.ts";
import { useProducers } from "../hooks/useProducers.ts";
import { useTests } from "../hooks/useTests.ts";
import { GitBranch, GitLoop, GitPush, GitPullReques, GitClone, GitSettings, GitDeleteRepo } from "../util/icons.tsx";
import bannerIcon from "../assets/testengine-banner-icon.png";
import copilotIcon from "../assets/copilot-icon.svg";
import claudeIcon from "../assets/claude-ai-icon.svg";
import { useCopilot } from "../contexts/CopilotContext.tsx";

const useStyles = makeStyles({
    header: {
        height: "48px",
        minHeight: "48px",
        background: "linear-gradient(135deg, #0f62fe 0%, #6929c4 100%)",
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
        padding: "2px",
        borderRadius: tokens.borderRadiusMedium,
        backgroundColor: "white",
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
            borderColor: tokens.colorNeutralForegroundOnBrand as string as never,
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
    copilotBtn: {
        display: "flex",
        alignItems: "center",
        gap: tokens.spacingHorizontalXS,
        padding: "2px",
        borderRadius: "999px",
        background: "linear-gradient(135deg, #00aeff, #2253ce, #8c48ff, #f2598a, #ffb152)",
        cursor: "pointer",
        border: "none",
        "&:hover": {
            opacity: "0.85" as never,
        },
    },
    copilotBtnInner: {
        display: "flex",
        alignItems: "center",
        gap: tokens.spacingHorizontalXS,
        padding: `4px ${tokens.spacingHorizontalS}`,
        borderRadius: "999px",
        backgroundColor: "#1a0a3e",
        color: "white",
    },
});

const phaseLabels: Record<NonNullable<SyncPhase>, { label: string; step: number }> = {
    xrmContext: { label: "Generating C# entity classes", step: 1 },
    metadata: { label: "Generating C# test metadata", step: 2 },
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
    const producers = useProducers();
    const tests = useTests();
    const { dispatch: dispatchProducers } = useProducerContext();
    const { dispatch: dispatchTests } = useTestContext();
    const { dispatch: dispatchBuilder } = useBuilderContext();
    const copilot = useCopilot();
    const styles = useStyles();

    const [syncDialogOpen, setSyncDialogOpen] = useState(false);

    const [cloneDialogOpen, setCloneDialogOpen] = useState(false);
    const [cloneUrl, setCloneUrl] = useState("");
    const [cloneSubmitting, setCloneSubmitting] = useState(false);

    const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
    const [deleteSubmitting, setDeleteSubmitting] = useState(false);

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

    const handleClone = async () => {
        if (!cloneUrl.trim()) return;
        setCloneSubmitting(true);
        try {
            await git.clone({ repositoryUrl: cloneUrl.trim() });
            await Promise.all([producers.fetchAll(), tests.fetchAll()]);
            setCloneDialogOpen(false);
            setCloneUrl("");
        } finally {
            setCloneSubmitting(false);
        }
    };

    const handleDeleteRepository = async () => {
        setDeleteSubmitting(true);
        try {
            await git.deleteRepository();
            dispatchProducers({ type: "SET_PRODUCERS", payload: [] });
            dispatchTests({ type: "SET_TESTS", payload: [] });
            dispatchBuilder({ type: "CLEAR" });
            setDeleteDialogOpen(false);
        } finally {
            setDeleteSubmitting(false);
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
                <div style={{ display: "flex", flexDirection: "column" }}>
                    <Text weight="semibold" size={300}>TestCore Nexus</Text>
                    <Text size={100}>POC</Text>
                </div>
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

                {/* Settings menu */}
                <Menu>
                    <MenuTrigger disableButtonEnhancement>
                        <Tooltip content="Settings" relationship="label">
                            <button className={styles.iconBtn} aria-label="Settings">
                                <span className={styles.svgIcon}>{GitSettings}</span>
                            </button>
                        </Tooltip>
                    </MenuTrigger>
                    <MenuPopover>
                        <MenuList>
                            <MenuItem
                                icon={<span style={{ display: "flex", width: "16px", height: "16px" }}>{GitClone}</span>}
                                onClick={() => setCloneDialogOpen(true)}
                            >
                                Clone repository
                            </MenuItem>
                            {status?.cloned && (
                                <MenuItem
                                    icon={<span style={{ display: "flex", width: "16px", height: "16px", color: tokens.colorPaletteRedForeground1 }}>{GitDeleteRepo}</span>}
                                    style={{ color: tokens.colorPaletteRedForeground1 }}
                                    onClick={() => setDeleteDialogOpen(true)}
                                >
                                    Delete repository
                                </MenuItem>
                            )}
                        </MenuList>
                    </MenuPopover>
                </Menu>

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

                {/* Copilot button */}
                <div className={styles.divider} />
                <Tooltip content="Open Copilot Assistant" relationship="label">
                    <button className={styles.copilotBtn} onClick={copilot.open ? copilot.close : copilot.openChat} aria-label="Copilot">
                        <div className={styles.copilotBtnInner}>
                            <div style={{ position: "relative", width: "18px", height: "18px", flexShrink: 0 }}>
                                <img src={copilotIcon} alt="" style={{ width: "18px", height: "18px" }} />
                                <img src={claudeIcon} alt="" style={{ position: "absolute", bottom: "-2px", right: "-2px", width: "9px", height: "9px", borderRadius: "50%", border: "1px solid #1a0a3e", backgroundColor: "white" }} />
                            </div>
                            <Text size={200} style={{ color: "white" }}>Copilot</Text>
                        </div>
                    </button>
                </Tooltip>
            </div>

            {/* Clone repository dialog */}
            <Dialog open={cloneDialogOpen} onOpenChange={(_e, data) => { if (!data.open && !cloneSubmitting) { setCloneDialogOpen(false); setCloneUrl(""); } }}>
                <DialogSurface>
                    <DialogBody>
                        <DialogTitle>Clone Repository</DialogTitle>
                        <DialogContent style={{ display: "flex", flexDirection: "column", gap: tokens.spacingVerticalM }}>
                            <Field label="Repository URL" required>
                                <Input
                                    value={cloneUrl}
                                    onChange={(_ev, data) => setCloneUrl(data.value)}
                                    onKeyDown={(e) => { if (e.key === "Enter") handleClone(); }}
                                    placeholder="https://github.com/org/repo.git"
                                    disabled={cloneSubmitting}
                                />
                            </Field>
                        </DialogContent>
                        <DialogActions>
                            <Button appearance="secondary" onClick={() => { setCloneDialogOpen(false); setCloneUrl(""); }} disabled={cloneSubmitting}>
                                Cancel
                            </Button>
                            <Button appearance="primary" onClick={handleClone} disabled={!cloneUrl.trim() || cloneSubmitting}>
                                {cloneSubmitting ? "Cloning…" : "Clone"}
                            </Button>
                        </DialogActions>
                    </DialogBody>
                </DialogSurface>
            </Dialog>

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

            {/* Delete repository confirm dialog */}
            <Dialog open={deleteDialogOpen} onOpenChange={(_e, data) => { if (!data.open && !deleteSubmitting) setDeleteDialogOpen(false); }}>
                <DialogSurface>
                    <DialogBody>
                        <DialogTitle>Delete Repository</DialogTitle>
                        <DialogContent style={{ display: "flex", flexDirection: "column", gap: tokens.spacingVerticalM }}>
                            <Text style={{ color: tokens.colorPaletteRedForeground1, fontWeight: tokens.fontWeightSemibold }}>
                                This will permanently delete the local repository clone and reset all git state.
                            </Text>
                            <Text size={200} style={{ color: tokens.colorNeutralForeground2 }}>
                                Any uncommitted changes will be lost. This cannot be undone.
                            </Text>
                        </DialogContent>
                        <DialogActions>
                            <Button appearance="secondary" onClick={() => setDeleteDialogOpen(false)} disabled={deleteSubmitting}>
                                Cancel
                            </Button>
                            <Button
                                appearance="primary"
                                style={{ backgroundColor: tokens.colorPaletteRedBackground3, borderColor: tokens.colorPaletteRedBackground3 }}
                                onClick={handleDeleteRepository}
                                disabled={deleteSubmitting}
                            >
                                {deleteSubmitting ? "Deleting…" : "Delete Repository"}
                            </Button>
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
