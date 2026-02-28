import { useEffect, useState } from "react";
import {
    Text,
    Button,
    Input,
    Field,
    Dialog,
    DialogTrigger,
    DialogSurface,
    DialogBody,
    DialogTitle,
    DialogContent,
    DialogActions,
    Spinner,
    TabList,
    Tab,
    Tree,
    TreeItem,
    TreeItemLayout,
    makeStyles,
    tokens,
    type SelectTabData,
    type SelectTabEvent,
} from "@fluentui/react-components";
import {
    EditRegular,
    FlashRegular,
    FilterRegular,
    MoreHorizontalRegular,
    FolderRegular,
    FolderAddRegular,
    BoxEditRegular,
} from "@fluentui/react-icons";
import { useProducers } from "../hooks/useProducers.ts";
import { useExtensions } from "../hooks/useExtensions.ts";
import { useAppMode } from "../contexts/AppModeContext.tsx";
import dataproducerIcon from "../assets/dataproducer-icon.svg";
import dataverseserviceIcon from "../assets/dataverseservice-icon.svg";
import assertIcon from "../assets/assert-icon.svg";

type TabValue = "producers" | "extensions" | "misc";

// ─── Styles ──────────────────────────────────────────────────────────────────

const useStyles = makeStyles({
    pane: {
        width: "280px",
        minWidth: "280px",
        borderLeft: `1px solid ${tokens.colorNeutralStroke2}`,
        backgroundColor: tokens.colorNeutralBackground2,
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
        paddingRight: tokens.spacingHorizontalM,
        borderBottom: `1px solid ${tokens.colorNeutralStroke2}`,
    },
    content: {
        flex: 1,
        overflowY: "auto",
        padding: tokens.spacingHorizontalS,
    },
    producersTab: {
        flex: 1,
        minHeight: 0,
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
    },
    producersScroll: {
        flex: 1,
        overflowY: "auto",
        padding: tokens.spacingHorizontalS,
    },
    item: {
        display: "flex",
        alignItems: "center",
        gap: tokens.spacingHorizontalS,
        padding: `${tokens.spacingVerticalS} ${tokens.spacingHorizontalM}`,
        cursor: "grab",
        borderRadius: tokens.borderRadiusMedium,
        border: `1px solid transparent`,
        fontSize: tokens.fontSizeBase200,
        flex: 1,
        minWidth: 0,
        "&:hover": {
            backgroundColor: tokens.colorNeutralBackground1Hover,
            borderColor: tokens.colorNeutralStroke2 as string as never,
        },
        "&:active": {
            cursor: "grabbing",
        },
    },
    itemIcon: {
        width: "20px",
        height: "20px",
        flexShrink: 0,
    },
    empty: {
        padding: tokens.spacingHorizontalM,
        textAlign: "center" as const,
    },
    footer: {
        borderTop: `1px solid ${tokens.colorNeutralStroke2}`,
        padding: tokens.spacingHorizontalXS,
    },
});

// ─── Drag helpers ────────────────────────────────────────────────────────────

function onDragStart(e: React.DragEvent, type: string, data: string) {
    e.dataTransfer.setData("application/testengine-type", type);
    e.dataTransfer.setData("application/testengine-data", data);
    e.dataTransfer.effectAllowed = "copy";
}

// ─── Tab content ─────────────────────────────────────────────────────────────

function ProducersTab() {
    const styles = useStyles();
    const { producers, loading, fetchAll } = useProducers();
    const { dispatch: modeDispatch } = useAppMode();
    const [expanded, setExpanded] = useState<Set<string>>(new Set());
    const [newFolderOpen, setNewFolderOpen] = useState(false);
    const [newEntityName, setNewEntityName] = useState("");

    useEffect(() => {
        fetchAll();
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    // Auto-expand all entities once loaded
    useEffect(() => {
        if (!loading && producers.length > 0) {
            setExpanded(new Set(producers.map((p) => p.entityName)));
        }
    }, [loading, producers]);

    const toggleExpanded = (entity: string) => {
        setExpanded((prev) => {
            const next = new Set(prev);
            if (next.has(entity)) next.delete(entity);
            else next.add(entity);
            return next;
        });
    };

    // Open the editor for an existing producer (edit all drafts)
    const openEditor = (entityName: string) => {
        modeDispatch({
            type: "OPEN_PRODUCER_EDITOR",
            payload: { entityName, dsl: null, isNew: false },
        });
    };

    // Create a new producer file (folder/class) and open its editor
    const handleCreateFolder = () => {
        if (!newEntityName.trim()) return;
        modeDispatch({
            type: "OPEN_PRODUCER_EDITOR",
            payload: { entityName: newEntityName.trim(), dsl: null, isNew: true },
        });
        setNewFolderOpen(false);
        setNewEntityName("");
    };

    if (loading) return <Spinner size="small" label="Loading producers..." />;

    // Group drafts by entity
    const grouped = new Map<string, { draftId: string; entityName: string }[]>();
    for (const p of producers) {
        for (const d of p.dsl?.drafts ?? []) {
            const list = grouped.get(p.entityName) ?? [];
            list.push({ draftId: d.id, entityName: p.entityName });
            grouped.set(p.entityName, list);
        }
        // Also include entities with no drafts so they appear in the tree
        if (!grouped.has(p.entityName)) {
            grouped.set(p.entityName, []);
        }
    }

    return (
        <div className={styles.producersTab}>
            <div className={styles.producersScroll}>
                {grouped.size === 0 && (
                    <Text size={200} className={styles.empty}>No producers available</Text>
                )}
                {grouped.size > 0 && (
                    <Tree aria-label="Producers">
                        {[...grouped.entries()].map(([entity, drafts]) => (
                            <TreeItem
                                key={entity}
                                itemType="branch"
                                open={expanded.has(entity)}
                                onOpenChange={() => toggleExpanded(entity)}
                            >
                                <TreeItemLayout
                                    iconBefore={<FolderRegular />}
                                    actions={{
                                        visible: true,
                                        children: (
                                            <Button
                                                appearance="subtle"
                                                size="small"
                                                icon={<BoxEditRegular />}
                                                onClick={(e) => { e.stopPropagation(); openEditor(entity); }}
                                                title={`Edit ${entity}`}
                                            />
                                        ),
                                    }}
                                >
                                    <Text size={200} weight="semibold">{entity}</Text>
                                </TreeItemLayout>
                                <Tree>
                                    {drafts.map((d) => (
                                        <TreeItem key={d.draftId} itemType="leaf">
                                            <TreeItemLayout>
                                                <div
                                                    className={styles.item}
                                                    draggable
                                                    onDragStart={(e) =>
                                                        onDragStart(e, "producer", JSON.stringify({
                                                            entityName: d.entityName,
                                                            draftId: d.draftId,
                                                        }))
                                                    }
                                                >
                                                    <img className={styles.itemIcon} src={dataproducerIcon} alt="" />
                                                    <Text size={200}>{d.draftId}</Text>
                                                </div>
                                            </TreeItemLayout>
                                        </TreeItem>
                                    ))}
                                </Tree>
                            </TreeItem>
                        ))}
                    </Tree>
                )}
            </div>

            {/* Footer: create new producer file (folder/class) */}
            <div className={styles.footer}>
                <Dialog open={newFolderOpen} onOpenChange={(_e, data) => setNewFolderOpen(data.open)}>
                    <DialogTrigger disableButtonEnhancement>
                        <Button
                            appearance="subtle"
                            size="small"
                            icon={<FolderAddRegular />}
                            style={{ width: "100%" }}
                        >
                            New Producer File
                        </Button>
                    </DialogTrigger>
                    <DialogSurface>
                        <DialogBody>
                            <DialogTitle>New Data Producer File</DialogTitle>
                            <DialogContent style={{ display: "flex", flexDirection: "column", gap: tokens.spacingVerticalM }}>
                                <Field label="Entity name" required hint="Creates DataProducer.{EntityName}.cs">
                                    <Input
                                        placeholder="e.g. Skill"
                                        value={newEntityName}
                                        onChange={(_ev, data) => setNewEntityName(data.value)}
                                        onKeyDown={(e) => { if (e.key === "Enter") handleCreateFolder(); }}
                                    />
                                </Field>
                            </DialogContent>
                            <DialogActions>
                                <DialogTrigger disableButtonEnhancement>
                                    <Button appearance="secondary">Cancel</Button>
                                </DialogTrigger>
                                <Button
                                    appearance="primary"
                                    onClick={handleCreateFolder}
                                    disabled={!newEntityName.trim()}
                                >
                                    Create
                                </Button>
                            </DialogActions>
                        </DialogBody>
                    </DialogSurface>
                </Dialog>
            </div>
        </div>
    );
}

function ExtensionsTab() {
    const styles = useStyles();
    const { extensions, loading, fetchAll } = useExtensions();

    useEffect(() => {
        fetchAll();
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    if (loading) return <Spinner size="small" label="Loading extensions..." />;

    return (
        <div>
            <div
                className={styles.item}
                draggable
                onDragStart={(e) => onDragStart(e, "with", "")}
            >
                <EditRegular fontSize={20} />
                <Text size={200}>With Block</Text>
            </div>
            {extensions.map((ext) =>
                ext.methods.map((m) => (
                    <div
                        key={`${ext.entityName}.${m.name}`}
                        className={styles.item}
                        draggable
                        onDragStart={(e) =>
                            onDragStart(e, "extension", JSON.stringify({ entity: ext.entityName, method: m }))
                        }
                    >
                        <FlashRegular fontSize={20} />
                        <Text size={200} title={m.signature}>{m.name}</Text>
                    </div>
                )),
            )}
        </div>
    );
}

function MiscTab() {
    const styles = useStyles();
    const assertBlocks = [
        { id: "notNull", label: "NotNull" },
        { id: "be", label: "Be" },
        { id: "containSingle", label: "ContainSingle" },
    ];

    return (
        <div>
            <div
                className={styles.item}
                draggable
                onDragStart={(e) => onDragStart(e, "where", "")}
            >
                <img className={styles.itemIcon} src={dataverseserviceIcon} alt="" />
                <Text size={200}>DataverseService</Text>
            </div>
            {assertBlocks.map((b) => (
                <div
                    key={b.id}
                    className={styles.item}
                    draggable
                    onDragStart={(e) => onDragStart(e, "assert", b.id)}
                >
                    <img className={styles.itemIcon} src={assertIcon} alt="" />
                    <Text size={200}>{b.label}</Text>
                </div>
            ))}
        </div>
    );
}

// ─── Main Component ──────────────────────────────────────────────────────────

export function ComponentExplorer() {
    const styles = useStyles();
    const [activeTab, setActiveTab] = useState<TabValue>("producers");

    const onTabSelect = (_event: SelectTabEvent, data: SelectTabData) => {
        setActiveTab(data.value as TabValue);
    };

    return (
        <div className={styles.pane}>
            <div className={styles.header}>
                <Text weight="semibold" size={200}>Components</Text>
            </div>

            <TabList
                selectedValue={activeTab}
                onTabSelect={onTabSelect}
                size="small"
            >
                <Tab value="producers" icon={<FilterRegular />}>Producers</Tab>
                <Tab value="extensions" icon={<FlashRegular />}>Extensions</Tab>
                <Tab value="misc" icon={<MoreHorizontalRegular />}>Misc</Tab>
            </TabList>

            {activeTab === "producers"
                ? <ProducersTab />
                : (
                    <div className={styles.content}>
                        {activeTab === "extensions" && <ExtensionsTab />}
                        {activeTab === "misc" && <MiscTab />}
                    </div>
                )
            }
        </div>
    );
}
