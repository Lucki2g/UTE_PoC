import { useCallback, useEffect, useState } from "react";
import {
    Text,
    Button,
    Input,
    Field,
    Spinner,
    Badge,
    Dialog,
    DialogTrigger,
    DialogSurface,
    DialogBody,
    DialogTitle,
    DialogContent,
    DialogActions,
    makeStyles,
    tokens,
} from "@fluentui/react-components";
import {
    SaveRegular,
    DismissRegular,
    AddRegular,
    BeakerSettingsRegular,
} from "@fluentui/react-icons";
import { GitPush } from "../util/icons.tsx";
import { useAppMode } from "../contexts/AppModeContext.tsx";
import { useProducers } from "../hooks/useProducers.ts";
import { useGit } from "../hooks/useGit.ts";
import { producerService } from "../services/producerService.ts";
import { UnsavedChangesDialog } from "./UnsavedChangesDialog.tsx";
import { ProducerDraftNode } from "./nodes/producerDraft/ProducerDraftNode.tsx";
import type { DslDraftDefinition, DslProducerDefinition } from "../models/dsl.ts";

const useStyles = makeStyles({
    pane: {
        flex: 1,
        minWidth: 0,
        backgroundColor: tokens.colorNeutralBackground3,
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
    },
    header: {
        height: "40px",
        minHeight: "40px",
        display: "flex",
        alignItems: "center",
        paddingLeft: tokens.spacingHorizontalM,
        paddingRight: tokens.spacingHorizontalS,
        borderBottom: `1px solid ${tokens.colorNeutralStroke2}`,
        gap: tokens.spacingHorizontalS,
    },
    body: {
        flex: 1,
        overflowY: "auto",
        padding: tokens.spacingHorizontalM,
        display: "flex",
        flexDirection: "column",
        gap: tokens.spacingVerticalM,
        alignItems: "flex-start",
    },
    empty: {
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        height: "100%",
        width: "100%",
        gap: tokens.spacingVerticalM,
        color: tokens.colorNeutralForeground4,
    },
    dirtyBadge: {
        marginLeft: tokens.spacingHorizontalXS,
        backgroundColor: tokens.colorPaletteDarkOrangeBackground3,
    },
    iconWrapper: {
        display: "flex",
        alignItems: "center",
        color: "currentColor",
    },
});

export function ProducerBuilderPane() {
    const styles = useStyles();
    const { state, dispatch } = useAppMode();
    const producers = useProducers();
    const git = useGit();

    const [dsl, setDsl] = useState<DslProducerDefinition | null>(null);
    const [dirty, setDirty] = useState(false);
    const [loading, setLoading] = useState(false);
    const [closeWarning, setCloseWarning] = useState(false);
    const [addDraftOpen, setAddDraftOpen] = useState(false);
    const [newDraftId, setNewDraftId] = useState("");
    const [newEntityName, setNewEntityName] = useState("");

    const editorState = state.producerEditor;

    // Load the producer DSL when the editor opens
    useEffect(() => {
        if (!editorState) return;

        if (editorState.isNew) {
            setDsl({ dslVersion: "1.0", producer: "DataProducer", drafts: [] });
            setDirty(false);
            if (editorState.focusNewDraft) {
                setAddDraftOpen(true);
                dispatch({ type: "CLEAR_FOCUS_NEW_DRAFT" });
            }
            return;
        }

        setLoading(true);
        producerService.getByEntityName(editorState.entityName)
            .then((metadata) => {
                setDsl(metadata.dsl ?? { dslVersion: "1.0", producer: "DataProducer", drafts: [] });
                setDirty(false);
                if (editorState.focusNewDraft) {
                    setAddDraftOpen(true);
                    dispatch({ type: "CLEAR_FOCUS_NEW_DRAFT" });
                }
            })
            .catch(() => {
                setDsl({ dslVersion: "1.0", producer: "DataProducer", drafts: [] });
            })
            .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [editorState?.entityName, editorState?.isNew]);

    const handleDraftChange = useCallback((index: number, updated: DslDraftDefinition) => {
        setDsl((prev) => {
            if (!prev) return prev;
            const drafts = [...prev.drafts];
            drafts[index] = updated;
            return { ...prev, drafts };
        });
        setDirty(true);
    }, []);

    const handleDraftDelete = useCallback((index: number) => {
        setDsl((prev) => {
            if (!prev) return prev;
            return { ...prev, drafts: prev.drafts.filter((_, i) => i !== index) };
        });
        setDirty(true);
    }, []);

    const openAddDraftDialog = useCallback(() => {
        setNewDraftId("");
        setNewEntityName(dsl?.drafts[0]?.entity.logicalName ?? "");
        setAddDraftOpen(true);
    }, [dsl]);

    const handleAddDraft = useCallback(() => {
        if (!newDraftId.trim() || !newEntityName.trim()) return;
        const newDraft: DslDraftDefinition = {
            id: newDraftId.trim(),
            entity: { logicalName: newEntityName.trim(), type: "entity" },
            accessModifier: "internal",
            rules: [],
        };
        setDsl((prev) => {
            if (!prev) return prev;
            return { ...prev, drafts: [...prev.drafts, newDraft] };
        });
        setDirty(true);
        setAddDraftOpen(false);
        setNewDraftId("");
        setNewEntityName("");
    }, [newDraftId, newEntityName]);

    const persistProducer = useCallback(async () => {
        if (!editorState || !dsl) return;
        if (editorState.isNew) {
            await producers.create({ code: dsl });
        } else {
            await producers.update({ entityName: editorState.entityName, code: dsl });
        }
        setDirty(false);
    }, [editorState, dsl, producers]);

    const handleSave = useCallback(async () => {
        await persistProducer();
        // Auto-commit after saving the file
        try {
            const label = editorState?.entityName ?? "producer";
            await git.save({ message: `chore: save producer ${label}` });
        } catch {
            // Commit failure is non-fatal — file is already saved on disk
        }
    }, [persistProducer, git, editorState?.entityName]);

    const handleSaveAndPublish = useCallback(async () => {
        await persistProducer();
        // Commit then push to remote
        try {
            const label = editorState?.entityName ?? "producer";
            await git.save({ message: `chore: publish producer ${label}` });
            await git.publish();
        } catch {
            // Non-fatal
        }
    }, [persistProducer, git, editorState?.entityName]);

    const handleClose = useCallback(() => {
        if (dirty) {
            setCloseWarning(true);
            return;
        }
        dispatch({ type: "CLOSE_PRODUCER_EDITOR" });
    }, [dirty, dispatch]);

    const handleConfirmClose = useCallback(() => {
        setCloseWarning(false);
        dispatch({ type: "CLOSE_PRODUCER_EDITOR" });
    }, [dispatch]);

    if (!editorState) return null;


    return (
        <div className={styles.pane}>
            <div className={styles.header}>
                <Text weight="semibold" size={200}>Producer Editor</Text>
                <Text size={100} style={{ color: tokens.colorNeutralForeground3 }}>
                    — {editorState.entityName}
                    {editorState.isNew && " (new)"}
                </Text>
                {dirty && (
                    <Badge icon={<BeakerSettingsRegular />} size="small" className={styles.dirtyBadge}>
                        Unsaved
                    </Badge>
                )}
                <div style={{ marginLeft: "auto", display: "flex", gap: tokens.spacingHorizontalS }}>
                    <Button
                        appearance="subtle"
                        size="small"
                        icon={<SaveRegular />}
                        onClick={handleSave}
                        disabled={!dirty || loading}
                    >
                        Save
                    </Button>
                    <Button
                        appearance="primary"
                        size="small"
                        icon={<span className={styles.iconWrapper}>{GitPush}</span>}
                        onClick={handleSaveAndPublish}
                        disabled={!dirty || loading}
                    >
                        Save & Publish
                    </Button>
                    <Button
                        appearance="secondary"
                        size="small"
                        icon={<DismissRegular />}
                        onClick={handleClose}
                    >
                        Close
                    </Button>
                </div>
            </div>

            <div className={styles.body}>
                {loading && <Spinner size="small" label="Loading producer..." />}

                {!loading && dsl && dsl.drafts.length === 0 && (
                    <div className={styles.empty}>
                        <Text size={300}>No drafts yet</Text>
                        <Text size={200}>Click "Add Draft" to define a new Draft method</Text>
                    </div>
                )}

                {!loading && dsl && dsl.drafts.map((draft, i) => (
                    <ProducerDraftNode
                        key={draft.id + i}
                        draft={draft}
                        onChange={(updated) => handleDraftChange(i, updated)}
                        onDelete={() => handleDraftDelete(i)}
                    />
                ))}

                {!loading && (
                    <Dialog open={addDraftOpen} onOpenChange={(_e, data) => setAddDraftOpen(data.open)}>
                        <DialogTrigger disableButtonEnhancement>
                            <Button
                                size="small"
                                appearance="subtle"
                                icon={<AddRegular />}
                                onClick={openAddDraftDialog}
                            >
                                Add Draft
                            </Button>
                        </DialogTrigger>
                        <DialogSurface>
                            <DialogBody>
                                <DialogTitle>Add Draft Method</DialogTitle>
                                <DialogContent style={{ display: "flex", flexDirection: "column", gap: tokens.spacingVerticalM }}>
                                    <Field label="Draft method name" required>
                                        <Input
                                            placeholder="e.g. DraftValidSkill"
                                            value={newDraftId}
                                            onChange={(_ev, data) => setNewDraftId(data.value)}
                                            onKeyDown={(e) => { if (e.key === "Enter") handleAddDraft(); }}
                                        />
                                    </Field>
                                    <Field label="Entity logical name" required>
                                        <Input
                                            placeholder="e.g. ape_skill"
                                            value={newEntityName}
                                            onChange={(_ev, data) => setNewEntityName(data.value)}
                                            onKeyDown={(e) => { if (e.key === "Enter") handleAddDraft(); }}
                                        />
                                    </Field>
                                </DialogContent>
                                <DialogActions>
                                    <DialogTrigger disableButtonEnhancement>
                                        <Button appearance="secondary">Cancel</Button>
                                    </DialogTrigger>
                                    <Button
                                        appearance="primary"
                                        onClick={handleAddDraft}
                                        disabled={!newDraftId.trim() || !newEntityName.trim()}
                                    >
                                        Add
                                    </Button>
                                </DialogActions>
                            </DialogBody>
                        </DialogSurface>
                    </Dialog>
                )}
            </div>

            <UnsavedChangesDialog
                open={closeWarning}
                onDiscard={handleConfirmClose}
                onCancel={() => setCloseWarning(false)}
                message="You have unsaved changes to this producer. Discard them?"
                discardLabel="Discard & Close"
            />
        </div>
    );
}
