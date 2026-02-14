import { useEffect } from "react";
import {
    Text,
    Spinner,
    TabList,
    Tab,
    makeStyles,
    tokens,
    type SelectTabData,
    type SelectTabEvent,
} from "@fluentui/react-components";
import {
    EditRegular,
    WrenchRegular,
    FlashRegular,
    FilterRegular,
    ShieldCheckmarkRegular,
} from "@fluentui/react-icons";
import { useProducers } from "../hooks/useProducers.ts";
import { useExtensions } from "../hooks/useExtensions.ts";
import dataproducerIcon from "../assets/dataproducer-icon.svg";
import dataverseserviceIcon from "../assets/dataverseservice-icon.svg";
import assertIcon from "../assets/assert-icon.svg";
import { useState } from "react";

type TabValue = "producers" | "extensions" | "linq" | "assert";

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
    item: {
        display: "flex",
        alignItems: "center",
        gap: tokens.spacingHorizontalS,
        padding: `${tokens.spacingVerticalS} ${tokens.spacingHorizontalM}`,
        cursor: "grab",
        borderRadius: tokens.borderRadiusMedium,
        border: `1px solid transparent`,
        fontSize: tokens.fontSizeBase200,
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

    useEffect(() => {
        fetchAll();
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    if (loading) return <Spinner size="small" label="Loading producers..." />;

    return (
        <div>
            {producers.map((p) => (
                <div
                    key={p.entityName}
                    className={styles.item}
                    draggable
                    onDragStart={(e) => onDragStart(e, "producer", JSON.stringify(p))}
                >
                    <img className={styles.itemIcon} src={dataproducerIcon} alt="" />
                    <Text size={200}>Draft&lt;{p.entityName}&gt;</Text>
                </div>
            ))}
            {producers.length === 0 && (
                <Text size={200} className={styles.empty}>No producers available</Text>
            )}
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
            <div
                className={styles.item}
                draggable
                onDragStart={(e) => onDragStart(e, "build", "")}
            >
                <WrenchRegular fontSize={20} />
                <Text size={200}>Build Toggle</Text>
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

function LinqTab() {
    const styles = useStyles();
    return (
        <div>
            <div
                className={styles.item}
                draggable
                onDragStart={(e) => onDragStart(e, "where", "")}
            >
                <img className={styles.itemIcon} src={dataverseserviceIcon} alt="" />
                <Text size={200}>Where Expression</Text>
            </div>
        </div>
    );
}

function AssertTab() {
    const styles = useStyles();
    const blocks = [
        { id: "notNull", label: "NotNull" },
        { id: "shouldBe", label: "ShouldBe" },
        { id: "throws", label: "Throws" },
        { id: "containSingle", label: "ContainSingle" },
    ];

    return (
        <div>
            {blocks.map((b) => (
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
                <Tab value="linq" icon={<FilterRegular />}>LINQ</Tab>
                <Tab value="assert" icon={<ShieldCheckmarkRegular />}>Assert</Tab>
            </TabList>

            <div className={styles.content}>
                {activeTab === "producers" && <ProducersTab />}
                {activeTab === "extensions" && <ExtensionsTab />}
                {activeTab === "linq" && <LinqTab />}
                {activeTab === "assert" && <AssertTab />}
            </div>
        </div>
    );
}
