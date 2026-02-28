import { useMemo, useState, useRef } from "react";
import {
    Button,
    Combobox,
    Input,
    Dropdown,
    Option,
    OptionGroup,
    Text,
    makeStyles,
    mergeClasses,
    tokens,
} from "@fluentui/react-components";
import {
    AddRegular,
    DeleteRegular,
    RenameRegular,
    CheckmarkRegular,
    DismissRegular,
} from "@fluentui/react-icons";
import type {
    DslDraftDefinition,
    DslDraftRule,
    DslDraftValue,
    DslDraftReferenceValue,
} from "../../../models/dsl.ts";
import { useEntityColumns } from "../../../hooks/useEntityColumns.ts";
import { useProducers } from "../../../hooks/useProducers.ts";
import { ColumnLookup } from "../../fields/ColumnLookup.tsx";
import dataproducerIcon from "../../../assets/dataproducer-icon.svg";

const useStyles = makeStyles({
    node: {
        backgroundColor: tokens.colorNeutralBackground1,
        border: `1px solid ${tokens.colorNeutralStroke2}`,
        borderRadius: tokens.borderRadiusLarge,
        width: "100%",
        boxSizing: "border-box",
        boxShadow: tokens.shadow4,
    },
    selected: {
        borderColor: tokens.colorBrandStroke1 as string as never,
        boxShadow: tokens.shadow8Brand,
    },
    header: {
        display: "flex",
        alignItems: "center",
        gap: tokens.spacingHorizontalXS,
        padding: `${tokens.spacingVerticalXS} ${tokens.spacingHorizontalS}`,
        backgroundColor: tokens.colorPaletteYellowBackground1,
        borderRadius: `${tokens.borderRadiusLarge} ${tokens.borderRadiusLarge} 0 0`,
        borderBottom: `1px solid ${tokens.colorNeutralStroke2}`,
    },
    icon: {
        width: "18px",
        height: "18px",
        flexShrink: 0,
    },
    body: {
        padding: tokens.spacingHorizontalS,
        display: "flex",
        flexDirection: "column",
        gap: tokens.spacingVerticalXS,
    },
    rule: {
        display: "flex",
        alignItems: "center",
        flexWrap: "wrap",
        gap: tokens.spacingHorizontalXS,
        padding: `${tokens.spacingVerticalXXS} ${tokens.spacingHorizontalXS}`,
        backgroundColor: tokens.colorNeutralBackground2,
        borderRadius: tokens.borderRadiusMedium,
        border: `1px solid ${tokens.colorNeutralStroke2}`,
    },
    refRule: {
        backgroundColor: tokens.colorPaletteTealBackground1,
        borderColor: tokens.colorPaletteTealBorderActive,
    },
    ruleType: {
        minWidth: "100px",
        flexShrink: 0,
    },
    valueInput: {
        flex: 1,
        minWidth: "80px",
    },
    addRow: {
        display: "flex",
        gap: tokens.spacingHorizontalXS,
        paddingTop: tokens.spacingVerticalXXS,
    },
});

interface ProducerDraftNodeProps {
    draft: DslDraftDefinition;
    selected?: boolean;
    onChange: (updated: DslDraftDefinition) => void;
    onDelete: () => void;
}

function deriveAlias(draftId: string): string {
    let name = draftId;
    if (name.startsWith("Draft")) name = name.slice("Draft".length);
    if (name.startsWith("Valid")) name = name.slice("Valid".length);
    if (!name) return "dep";
    return name[0].toLowerCase() + name.slice(1);
}

function defaultRuleValue(): DslDraftValue {
    return { kind: "constant", type: "string", value: "" };
}

export function ProducerDraftNode({ draft, selected, onChange, onDelete }: ProducerDraftNodeProps) {
    const styles = useStyles();
    const { columns } = useEntityColumns(draft.entity.logicalName);
    const { producers } = useProducers();
    const [renaming, setRenaming] = useState(false);
    const [renameValue, setRenameValue] = useState("");
    const renameInputRef = useRef<HTMLInputElement>(null);

    function startRename() {
        setRenameValue(draft.id);
        setRenaming(true);
        setTimeout(() => renameInputRef.current?.select(), 0);
    }

    function commitRename() {
        const trimmed = renameValue.trim();
        if (trimmed && trimmed !== draft.id) {
            onChange({ ...draft, id: trimmed });
        }
        setRenaming(false);
    }

    function cancelRename() {
        setRenaming(false);
    }

    // Ref rules declared in this draft: { alias, draft, entityName }
    const declaredRefs = useMemo(() => {
        const refs: { alias: string; draftId: string; entityName: string }[] = [];
        for (const rule of draft.rules) {
            if (rule.type === "ref" && rule.draft) {
                const alias = rule.alias ?? deriveAlias(rule.draft);
                // Find entity name of the referenced draft
                let entityName = "";
                for (const p of producers) {
                    const d = p.dsl?.drafts.find((d) => d.id === rule.draft);
                    if (d) { entityName = d.entity.logicalName; break; }
                }
                refs.push({ alias, draftId: rule.draft, entityName });
            }
        }
        return refs;
    }, [draft.rules, producers]);

    // All producer drafts, excluding this draft itself
    const allProducerDrafts = useMemo(() => {
        const list: { entityName: string; draftId: string; label: string }[] = [];
        for (const p of producers) {
            for (const d of p.dsl?.drafts ?? []) {
                if (d.id !== draft.id) {
                    list.push({ entityName: d.entity.logicalName, draftId: d.id, label: `${p.entityName}.${d.id}` });
                }
            }
        }
        return list;
    }, [producers, draft.id]);

    function getColumnInfo(attribute: string) {
        return columns.find((c) => c.logicalName === attribute);
    }

    function updateRule(index: number, updates: Partial<DslDraftRule>) {
        const rules = [...draft.rules];
        rules[index] = { ...rules[index], ...updates };
        onChange({ ...draft, rules });
    }

    function onAttributeChange(index: number, attribute: string) {
        const col = columns.find((c) => c.logicalName === attribute);
        const rule = draft.rules[index];
        let value = rule.value ?? defaultRuleValue();

        if (col?.enumMembers && col.enumMembers.length > 0) {
            if (value.kind !== "enum") {
                value = { kind: "enum", enumType: col.dataType, value: col.enumMembers[0] ?? "" };
            } else {
                value = { ...value, enumType: col.dataType };
            }
        } else if (isEntityRefType(col?.dataType)) {
            if (value.kind !== "reference") {
                value = { kind: "reference", draft: "", build: true, transform: "ToEntityReference" };
            }
        } else {
            if (value.kind !== "constant") {
                value = { kind: "constant", type: "string", value: "" };
            }
        }

        updateRule(index, { attribute, value });
    }

    function onValueKindChange(index: number, kind: string) {
        const col = getColumnInfo(draft.rules[index].attribute ?? "");
        let newValue: DslDraftValue;
        if (kind === "constant") {
            newValue = { kind: "constant", type: "string", value: "" };
        } else if (kind === "enum") {
            newValue = { kind: "enum", enumType: col?.dataType ?? "", value: col?.enumMembers?.[0] ?? "" };
        } else {
            newValue = { kind: "reference", draft: "", build: true, transform: "ToEntityReference" };
        }
        updateRule(index, { value: newValue });
    }

    function addRule(type: "with" | "withDefault" | "ref") {
        if (type === "ref") {
            const rules = [...draft.rules, { type: "ref" as const, draft: "", alias: "" }];
            onChange({ ...draft, rules });
        } else {
            const rules = [...draft.rules, { type, attribute: "", value: defaultRuleValue() }];
            onChange({ ...draft, rules });
        }
    }

    function removeRule(index: number) {
        const rules = draft.rules.filter((_, i) => i !== index);
        onChange({ ...draft, rules });
    }

    return (
        <div className={mergeClasses(styles.node, selected && styles.selected)}>
            <div className={styles.header}>
                <img src={dataproducerIcon} alt="" className={styles.icon} />
                {renaming ? (
                    <>
                        <Input
                            ref={renameInputRef}
                            size="small"
                            value={renameValue}
                            onChange={(_ev, data) => setRenameValue(data.value)}
                            onKeyDown={(e) => {
                                if (e.key === "Enter") commitRename();
                                if (e.key === "Escape") cancelRename();
                            }}
                            style={{ flex: 1 }}
                        />
                        <Button appearance="subtle" size="small" icon={<CheckmarkRegular />} onClick={commitRename} title="Confirm rename" />
                        <Button appearance="subtle" size="small" icon={<DismissRegular />} onClick={cancelRename} title="Cancel rename" />
                    </>
                ) : (
                    <>
                        <Text size={200} weight="semibold" style={{ flex: 1 }}>{draft.id}</Text>
                        <Text size={100} style={{ color: tokens.colorNeutralForeground3 }}>{draft.entity.logicalName}</Text>
                        <Button appearance="subtle" size="small" icon={<RenameRegular />} onClick={startRename} title="Rename draft" />
                        <Button appearance="subtle" size="small" icon={<DeleteRegular />} onClick={onDelete} title="Delete draft" />
                    </>
                )}
            </div>

            <div className={styles.body}>
                {draft.rules.length === 0 && (
                    <Text size={100} style={{ color: tokens.colorNeutralForeground4, fontStyle: "italic" }}>
                        No rules — add With, WithDefault or Ref below
                    </Text>
                )}

                {[...draft.rules.map((rule, i) => ({ rule, i }))]
                    .sort((a, b) => (a.rule.type === "ref" ? 0 : 1) - (b.rule.type === "ref" ? 0 : 1))
                    .map(({ rule, i }) => {
                    if (rule.type === "ref") {
                        return (
                            <RefRuleRow
                                key={i}
                                rule={rule}
                                allProducerDrafts={allProducerDrafts}
                                styles={styles}
                                onChange={(updates) => updateRule(i, updates)}
                                onDelete={() => removeRule(i)}
                            />
                        );
                    }

                    const col = getColumnInfo(rule.attribute ?? "");
                    const isEnum = !!(col?.enumMembers && col.enumMembers.length > 0);
                    const isEntityRef = !isEnum && isEntityRefType(col?.dataType);
                    const targetEntity = col?.targetEntity ?? null;

                    return (
                        <WithRuleRow
                            key={i}
                            rule={rule}
                            draftEntityName={draft.entity.logicalName}
                            col={col}
                            isEnum={isEnum}
                            isEntityRef={isEntityRef}
                            targetEntity={targetEntity}
                            allProducerDrafts={allProducerDrafts}
                            declaredRefs={declaredRefs}
                            styles={styles}
                            onTypeChange={(type) => updateRule(i, { type: type as "with" | "withDefault" })}
                            onAttributeChange={(attr) => onAttributeChange(i, attr)}
                            onValueKindChange={(kind) => onValueKindChange(i, kind)}
                            onValueChange={(value) => updateRule(i, { value })}
                            onDelete={() => removeRule(i)}
                        />
                    );
                })}

                <div className={styles.addRow}>
                    <Button size="small" appearance="subtle" icon={<AddRegular />} onClick={() => addRule("with")}>With</Button>
                    <Button size="small" appearance="subtle" icon={<AddRegular />} onClick={() => addRule("withDefault")}>WithDefault</Button>
                    <Button size="small" appearance="subtle" icon={<AddRegular />} onClick={() => addRule("ref")}>Ref</Button>
                </div>
            </div>
        </div>
    );
}

// ─── Ref rule row ─────────────────────────────────────────────────────────────

interface RefRuleRowProps {
    rule: DslDraftRule;
    allProducerDrafts: { entityName: string; draftId: string; label: string }[];
    styles: ReturnType<typeof useStyles>;
    onChange: (updates: Partial<DslDraftRule>) => void;
    onDelete: () => void;
}

function RefRuleRow({ rule, allProducerDrafts, styles, onChange, onDelete }: RefRuleRowProps) {
    const alias = rule.alias ?? (rule.draft ? deriveAlias(rule.draft) : "");

    return (
        <div className={mergeClasses(styles.rule, styles.refRule)}>
            <Text size={100} weight="semibold" style={{ flexShrink: 0, minWidth: "90px" }}>Ref</Text>
            {/* Draft picker — all producers, no filter */}
            <Dropdown
                size="small"
                className={styles.valueInput}
                placeholder="Draft..."
                value={rule.draft ?? ""}
                selectedOptions={rule.draft ? [rule.draft] : []}
                onOptionSelect={(_ev, data) => {
                    const newDraft = data.optionValue ?? "";
                    const derivedAlias = deriveAlias(newDraft);
                    onChange({ draft: newDraft, alias: derivedAlias });
                }}
            >
                {allProducerDrafts.map((d) => (
                    <Option key={d.label} value={d.draftId}>{d.label}</Option>
                ))}
            </Dropdown>
            <Text size={100} style={{ flexShrink: 0 }}>as</Text>
            {/* Alias — editable, auto-derived */}
            <Input
                size="small"
                style={{ width: "80px", flexShrink: 0 }}
                value={alias}
                placeholder="alias"
                onChange={(_ev, data) => onChange({ alias: data.value })}
            />
            <Button appearance="subtle" size="small" icon={<DeleteRegular />} onClick={onDelete} title="Remove Ref" />
        </div>
    );
}

// ─── With / WithDefault rule row ──────────────────────────────────────────────

interface WithRuleRowProps {
    rule: DslDraftRule;
    draftEntityName: string;
    col: ReturnType<typeof useEntityColumns>["columns"][number] | undefined;
    isEnum: boolean;
    isEntityRef: boolean;
    targetEntity: string | null;
    allProducerDrafts: { entityName: string; draftId: string; label: string }[];
    declaredRefs: { alias: string; draftId: string; entityName: string }[];
    styles: ReturnType<typeof useStyles>;
    onTypeChange: (type: string) => void;
    onAttributeChange: (attr: string) => void;
    onValueKindChange: (kind: string) => void;
    onValueChange: (value: DslDraftValue) => void;
    onDelete: () => void;
}

function WithRuleRow({
    rule, draftEntityName, col, isEnum, isEntityRef, targetEntity,
    allProducerDrafts, declaredRefs, styles,
    onTypeChange, onAttributeChange, onValueKindChange, onValueChange, onDelete,
}: WithRuleRowProps) {
    const value = rule.value ?? { kind: "constant" as const, type: "string", value: "" };

    // Producers filtered by targetEntity (if known)
    const filteredProducers = targetEntity
        ? allProducerDrafts.filter((d) => d.entityName === targetEntity)
        : allProducerDrafts;

    // When a ref is selected for this rule, get its entity name for the accessor column lookup
    const selectedRef = value.kind === "reference" && (value as DslDraftReferenceValue).refAlias
        ? declaredRefs.find((r) => r.alias === (value as DslDraftReferenceValue).refAlias)
        : null;

    // Current selection for the combined producer+ref dropdown
    const refVal = value.kind === "reference" ? (value as DslDraftReferenceValue) : null;
    const currentPickerValue = refVal?.refAlias
        ? `ref:${refVal.refAlias}`
        : (refVal?.draft ?? "");

    return (
        <div className={styles.rule}>
            {/* Rule type */}
            <Dropdown
                size="small"
                className={styles.ruleType}
                value={rule.type === "with" ? "With" : "WithDefault"}
                selectedOptions={[rule.type]}
                onOptionSelect={(_ev, data) => onTypeChange(data.optionValue as string)}
            >
                <Option value="with">With</Option>
                <Option value="withDefault">WithDefault</Option>
            </Dropdown>

            {/* Attribute */}
            <ColumnLookup
                entityName={draftEntityName}
                value={rule.attribute ?? ""}
                onChange={onAttributeChange}
            />

            <Text size={100} style={{ flexShrink: 0 }}>=</Text>

            {/* Value kind selector — hidden for auto-detected enum/entityref */}
            {!isEnum && !isEntityRef && (
                <Dropdown
                    size="small"
                    style={{ minWidth: "90px", flexShrink: 0 }}
                    value={value.kind}
                    selectedOptions={[value.kind]}
                    onOptionSelect={(_ev, data) => onValueKindChange(data.optionValue as string)}
                >
                    <Option value="constant">Constant</Option>
                    <Option value="enum">Enum</Option>
                    <Option value="reference">Reference</Option>
                </Dropdown>
            )}

            {/* Enum — auto-locked dropdown */}
            {isEnum && value.kind === "enum" && (
                <Dropdown
                    size="small"
                    className={styles.valueInput}
                    value={value.value}
                    selectedOptions={value.value ? [value.value] : []}
                    placeholder="Member..."
                    onOptionSelect={(_ev, data) =>
                        onValueChange({ ...value, value: data.optionValue ?? "" })
                    }
                >
                    {col!.enumMembers!.map((m) => <Option key={m} value={m}>{m}</Option>)}
                </Dropdown>
            )}

            {/* EntityRef or manual reference — combined Producers + Refs picker */}
            {(isEntityRef || (!isEnum && value.kind === "reference")) && (
                <>
                    <Combobox
                        size="small"
                        className={styles.valueInput}
                        placeholder="Producer or Ref..."
                        value={currentPickerValue}
                        selectedOptions={currentPickerValue ? [currentPickerValue] : []}
                        onOptionSelect={(_ev, data) => {
                            const v = data.optionValue ?? "";
                            if (v.startsWith("ref:")) {
                                const alias = v.slice(4);
                                const ref = declaredRefs.find((r) => r.alias === alias);
                                onValueChange({
                                    kind: "reference",
                                    draft: ref?.draftId ?? "",
                                    build: true,
                                    refAlias: alias,
                                    transform: undefined,
                                } as DslDraftReferenceValue);
                            } else {
                                onValueChange({
                                    kind: "reference",
                                    draft: v,
                                    build: true,
                                    transform: "ToEntityReference",
                                    refAlias: undefined,
                                } as DslDraftReferenceValue);
                            }
                        }}
                        listbox={{ style: { maxHeight: "240px" } }}
                    >
                        {declaredRefs.length > 0 && (
                            <OptionGroup label="Refs">
                                {declaredRefs.map((r) => (
                                    <Option key={`ref:${r.alias}`} value={`ref:${r.alias}`}>
                                        {r.alias} ({r.entityName})
                                    </Option>
                                ))}
                            </OptionGroup>
                        )}
                        <OptionGroup label={targetEntity ? `Producers (${targetEntity})` : "Producers"}>
                            {filteredProducers.map((d) => (
                                <Option key={d.draftId} value={d.draftId}>{d.label}</Option>
                            ))}
                        </OptionGroup>
                    </Combobox>

                    {/* When a Ref is selected, show column accessor lookup on the ref's entity,
                        filtered to columns whose type matches the attribute's target entity (A) */}
                    {selectedRef && (
                        <>
                            <Text size={100} style={{ flexShrink: 0 }}>.</Text>
                            <ColumnLookup
                                entityName={selectedRef.entityName}
                                value={refVal?.transform ?? ""}
                                filterDataType={targetEntity ?? undefined}
                                onChange={(col) =>
                                    onValueChange({ ...(refVal as DslDraftReferenceValue), transform: col })
                                }
                            />
                        </>
                    )}
                </>
            )}

            {/* Constant value */}
            {!isEnum && !isEntityRef && value.kind === "constant" && (
                <Input
                    size="small"
                    className={styles.valueInput}
                    placeholder="value"
                    value={String(value.value)}
                    onChange={(_ev, data) => onValueChange({ ...value, value: data.value })}
                />
            )}

            {/* Manual enum — two inputs */}
            {!isEnum && !isEntityRef && value.kind === "enum" && (
                <div style={{ display: "flex", gap: tokens.spacingHorizontalXXS, flex: 1 }}>
                    <Input
                        size="small"
                        style={{ flex: 1 }}
                        placeholder="EnumType"
                        value={value.enumType}
                        onChange={(_ev, data) => onValueChange({ ...value, enumType: data.value })}
                    />
                    <Input
                        size="small"
                        style={{ flex: 1 }}
                        placeholder="Member"
                        value={value.value}
                        onChange={(_ev, data) => onValueChange({ ...value, value: data.value })}
                    />
                </div>
            )}

            <Button
                appearance="subtle"
                size="small"
                icon={<DeleteRegular />}
                onClick={onDelete}
                title="Remove rule"
            />
        </div>
    );
}

function isEntityRefType(dataType: string | undefined): boolean {
    return dataType?.replace("?", "").trim() === "EntityReference";
}
