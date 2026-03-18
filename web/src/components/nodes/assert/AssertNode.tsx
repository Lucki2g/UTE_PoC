import { useMemo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import {
    Combobox,
    Dropdown,
    Input,
    Menu,
    MenuButton,
    MenuItem,
    MenuList,
    MenuPopover,
    MenuTrigger,
    Option,
    Text,
    makeStyles,
    tokens,
} from "@fluentui/react-components";
import { DeleteRegular, MoreHorizontalRegular } from "@fluentui/react-icons";
import type { BuilderNode, AssertNodeData, ProducerNodeData, ServiceNodeData } from "../../../models/builder.ts";
import type { DslValueExpression } from "../../../models/dsl.ts";
import type { EntityColumnInfo } from "../../../services/entitySchemaService.ts";
import { useBuilderContext } from "../../../contexts/BuilderContext.tsx";
import { ColumnLookup } from "../../fields/ColumnLookup.tsx";
import { useEntityColumns } from "../../../hooks/useEntityColumns.ts";
import assertIcon from "../../../assets/assert-icon.svg";

const assertionKinds = ["notNull", "be", "containSingle", "throw"] as const;
const entityRefSubProperties = ["Id", "Name"] as const;

const useStyles = makeStyles({
    node: {
        backgroundColor: tokens.colorNeutralBackground1,
        border: `1px solid ${tokens.colorNeutralStroke2}`,
        borderRadius: tokens.borderRadiusLarge,
        width: "480px",
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
        backgroundColor: tokens.colorPaletteLavenderBackground2,
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
    field: {
        display: "flex",
        alignItems: "center",
        gap: tokens.spacingHorizontalXS,
    },
    footer: {
        borderTop: `1px solid ${tokens.colorNeutralStroke2}`,
        padding: tokens.spacingHorizontalS,
        display: "flex",
        alignItems: "center",
        gap: tokens.spacingHorizontalXS,
    },
});

interface VarInfo {
    name: string;
    entityName: string | null;
    isList: boolean;
}

/** Renders the column picker (and optional sub-property for EntityReference columns) */
function MemberPicker({
    id,
    nodeData,
    selectedVarInfo,
}: {
    id: string;
    nodeData: AssertNodeData;
    selectedVarInfo: VarInfo;
}) {
    const { dispatch } = useBuilderContext();
    const { columns } = useEntityColumns(selectedVarInfo.entityName ?? "");

    const selectedColumn = nodeData.targetPath?.[0] ?? "";
    const columnInfo = useMemo(
        () => columns.find((c) => c.logicalName === selectedColumn),
        [columns, selectedColumn],
    );
    const isEntityRef = columnInfo?.dataType.replace("?", "").trim() === "EntityReference";

    // Resolve firstColumn's column info unconditionally (used only in the isList branch)
    const firstColInfo = useMemo(
        () => columns.find((c) => c.propertyName === nodeData.firstColumn),
        [columns, nodeData.firstColumn],
    );
    const firstColIsEntityRef = firstColInfo?.dataType.replace("?", "").trim() === "EntityReference";

    const setPath = (col: string, sub?: string) => {
        const path: string[] = col ? (sub ? [col, sub] : [col]) : [];
        dispatch({ type: "UPDATE_NODE", payload: { id, data: { targetPath: path } } });
    };

    if (selectedVarInfo.isList) {
        const memberValue = nodeData.targetPath?.[0] ?? "";
        const isFirst = memberValue === "First";

        return (
            <>
                <Combobox
                    size="small"
                    freeform
                    value={memberValue}
                    selectedOptions={memberValue ? [memberValue] : []}
                    onOptionSelect={(_ev, d) => {
                        const chosen = d.optionText ?? d.optionValue ?? "";
                        if (chosen !== "First") {
                            dispatch({ type: "UPDATE_NODE", payload: { id, data: { firstColumn: undefined, firstSubProp: undefined } } });
                        }
                        setPath(chosen);
                    }}
                    onChange={(ev) => setPath(ev.target.value)}
                    style={{ flex: 1, minWidth: "80px" }}
                >
                    <Option key="Count" value="Count">Count</Option>
                    <Option key="First" value="First">First</Option>
                </Combobox>
                {isFirst && selectedVarInfo.entityName && (
                    <ColumnLookup
                        entityName={selectedVarInfo.entityName}
                        value={nodeData.firstColumn ?? ""}
                        onChange={(col) =>
                            dispatch({ type: "UPDATE_NODE", payload: { id, data: { firstColumn: col, firstSubProp: undefined, expectedDsl: undefined } } })
                        }
                    />
                )}
                {isFirst && firstColIsEntityRef && nodeData.firstColumn && (
                    <Dropdown
                        size="small"
                        value={nodeData.firstSubProp ?? ""}
                        selectedOptions={nodeData.firstSubProp ? [nodeData.firstSubProp] : []}
                        onOptionSelect={(_ev, d) =>
                            dispatch({ type: "UPDATE_NODE", payload: { id, data: { firstSubProp: d.optionValue ?? "", expectedDsl: undefined } } })
                        }
                        placeholder=".Id/.Name"
                        style={{ minWidth: "90px" }}
                    >
                        {entityRefSubProperties.map((p) => (
                            <Option key={p} value={p}>{`.${p}`}</Option>
                        ))}
                    </Dropdown>
                )}
            </>
        );
    }

    if (selectedVarInfo.entityName) {
        return (
            <>
                <ColumnLookup
                    entityName={selectedVarInfo.entityName}
                    value={selectedColumn}
                    onChange={(col) => setPath(col)}
                />
                {isEntityRef && selectedColumn && (
                    <Dropdown
                        size="small"
                        value={nodeData.targetPath?.[1] ?? ""}
                        selectedOptions={nodeData.targetPath?.[1] ? [nodeData.targetPath[1]] : []}
                        onOptionSelect={(_ev, d) => setPath(selectedColumn, d.optionValue ?? "")}
                        placeholder=".Id/.Name"
                        style={{ minWidth: "90px" }}
                    >
                        {entityRefSubProperties.map((p) => (
                            <Option key={p} value={p}>{`.${p}`}</Option>
                        ))}
                    </Dropdown>
                )}
            </>
        );
    }

    return (
        <Input
            size="small"
            value={nodeData.targetPath?.[0] ?? ""}
            placeholder="member"
            onChange={(_ev, d) => setPath(d.value)}
            style={{ flex: 1 }}
        />
    );
}

/** Derives a display string from a DslValueExpression for showing in an Input */
function dslValueToString(v: DslValueExpression | undefined): string {
    if (!v) return "";
    switch (v.type) {
        case "string":      return v.value;
        case "number":      return String(v.value);
        case "boolean":     return String(v.value);
        case "guid":        return v.value;
        case "null":        return "null";
        case "enum":        return v.member;
        case "enumNumber":  return String(v.value);
        case "interpolation": return v.template;
        case "ref":         return v.ref.member ? `${v.ref.id}.${v.ref.member}` : (v.ref.id ?? "");
    }
}

/**
 * Renders the expected-value editor for an assertion.
 * - Enum column  → dropdown of enum members
 * - EntityRef column (or sub-prop already set) → var Combobox + .Id/.Name Dropdown
 * - Else → free Input
 *
 * columnInfo and isSubProp are resolved by the caller so this component works for
 * both plain member paths and First()-based list paths.
 */
function ExpectedValueEditor({
    id,
    nodeData,
    columnInfo,
    isSubProp,
}: {
    id: string;
    nodeData: AssertNodeData;
    columnInfo: EntityColumnInfo | undefined;
    isSubProp: boolean;
}) {
    const { state, dispatch } = useBuilderContext();

    const isEnum      = (columnInfo?.enumMembers?.length ?? 0) > 0;
    const isEntityRef = columnInfo?.dataType.replace("?", "").trim() === "EntityReference";

    const setExpected = (v: DslValueExpression) =>
        dispatch({ type: "UPDATE_NODE", payload: { id, data: { expectedDsl: v } } });

    // Current value helpers.
    // The backend decompiler encodes enum values as DslRefValue { id: enumType, member: value }
    // so we accept both "enum" and "ref" when the column is an enum type.
    const currentEnum = nodeData.expectedDsl?.type === "enum"
        ? nodeData.expectedDsl.member
        : (nodeData.expectedDsl?.type === "ref" && isEnum)
            ? (nodeData.expectedDsl.ref.member ?? "")
            : "";
    const currentRefId     = nodeData.expectedDsl?.type === "ref" ? (nodeData.expectedDsl.ref.id     ?? "") : "";
    const currentRefMember = nodeData.expectedDsl?.type === "ref" ? (nodeData.expectedDsl.ref.member ?? "") : "";

    // Collect all non-delegate variables as ref candidates
    const refVarOptions = useMemo(
        () => state.nodes.flatMap((n) => {
            const d = n.data as ProducerNodeData | ServiceNodeData;
            if (d.nodeType === "producer" && !d.anonymous && d.variableName)
                return [d.variableName];
            if (d.nodeType === "service" && d.resultVar)
                return [d.resultVar];
            return [];
        }),
        [state.nodes],
    );

    // Enum → dropdown of members
    if (isEnum && columnInfo) {
        const enumType = columnInfo.dataType.replace("?", "").trim();
        return (
            <Combobox
                size="small"
                freeform
                value={currentEnum}
                selectedOptions={currentEnum ? [currentEnum] : []}
                onOptionSelect={(_ev, d) => setExpected({ type: "enum", enumType, member: d.optionValue ?? "" })}
                onChange={(ev) => setExpected({ type: "enum", enumType, member: ev.target.value })}
                style={{ flex: 1 }}
                placeholder="Select value..."
            >
                {columnInfo.enumMembers!.map((m) => (
                    <Option key={m} value={m}>{m}</Option>
                ))}
            </Combobox>
        );
    }

    // EntityRef (or a sub-prop is already chosen) → variable picker + .Id/.Name
    if (isEntityRef || isSubProp) {
        return (
            <>
                <Combobox
                    size="small"
                    freeform
                    value={currentRefId}
                    selectedOptions={currentRefId ? [currentRefId] : []}
                    onOptionSelect={(_ev, d) => {
                        const varId = d.optionValue ?? "";
                        setExpected({ type: "ref", ref: { kind: "bindingVar", id: varId, member: currentRefMember || "Id" } });
                    }}
                    onChange={(ev) => {
                        setExpected({ type: "ref", ref: { kind: "bindingVar", id: ev.target.value, member: currentRefMember || "Id" } });
                    }}
                    style={{ flex: 1, minWidth: "80px" }}
                    placeholder="variable"
                >
                    {refVarOptions.map((v) => (
                        <Option key={v} value={v}>{v}</Option>
                    ))}
                </Combobox>
                <Dropdown
                    size="small"
                    value={currentRefMember}
                    selectedOptions={currentRefMember ? [currentRefMember] : []}
                    onOptionSelect={(_ev, d) => {
                        setExpected({ type: "ref", ref: { kind: "bindingVar", id: currentRefId, member: d.optionValue ?? "Id" } });
                    }}
                    placeholder=".Id/.Name"
                    style={{ minWidth: "90px" }}
                >
                    {entityRefSubProperties.map((p) => (
                        <Option key={p} value={p}>{`.${p}`}</Option>
                    ))}
                </Dropdown>
            </>
        );
    }

    // Free text input (string, number, boolean, etc.)
    return (
        <Input
            size="small"
            value={dslValueToString(nodeData.expectedDsl)}
            placeholder="expected value"
            onChange={(_ev, d) => {
                const raw = d.value;
                if (raw === "") { dispatch({ type: "UPDATE_NODE", payload: { id, data: { expectedDsl: undefined } } }); return; }
                if (raw === "true" || raw === "false") { setExpected({ type: "boolean", value: raw === "true" }); return; }
                if (raw === "null") { setExpected({ type: "null" }); return; }
                const num = Number(raw);
                if (!isNaN(num) && raw.trim() !== "") { setExpected({ type: "number", value: num }); return; }
                setExpected({ type: "string", value: raw });
            }}
            style={{ flex: 1 }}
        />
    );
}

export function AssertNode({ id, data, selected }: NodeProps<BuilderNode>) {
    const nodeData = data as AssertNodeData;
    const { state, dispatch } = useBuilderContext();
    const styles = useStyles();

    // Collect available variables with their entity info
    const varInfos = useMemo(() => {
        const infos: VarInfo[] = [];
        for (const n of state.nodes) {
            const d = n.data as ProducerNodeData | ServiceNodeData;
            if (d.nodeType === "producer" && !d.anonymous && d.variableName) {
                infos.push({ name: d.variableName, entityName: d.entityName, isList: false });
            } else if (d.nodeType === "service" && (d.operation === "RetrieveList" || d.operation === "RetrieveSingle") && d.resultVar) {
                const entityName = d.entitySet?.replace(/Set$/i, "") ?? null;
                infos.push({ name: d.resultVar, entityName, isList: d.operation === "RetrieveList" });
            } else if (d.nodeType === "service" && d.isDelegateAct && d.delegateVar) {
                infos.push({ name: d.delegateVar, entityName: null, isList: false });
            }
        }
        return infos;
    }, [state.nodes]);

    const selectedVarInfo = useMemo(
        () => varInfos.find((v) => v.name === nodeData.targetVar) ?? null,
        [varInfos, nodeData.targetVar],
    );

    // Resolve column schema for the entity the target var points to
    const { columns: targetColumns } = useEntityColumns(selectedVarInfo?.entityName ?? "");

    // Determine the column info and sub-prop flag to pass to ExpectedValueEditor.
    // For First()-based paths the relevant column is firstColumn; otherwise it's targetPath[0].
    const isFirstPath = nodeData.targetPath?.[0] === "First";
    const { expectedColumnInfo, expectedIsSubProp } = useMemo(() => {
        if (isFirstPath) {
            const col = targetColumns.find((c) => c.propertyName === nodeData.firstColumn);
            // Sub-prop is relevant when the column is an EntityRef and one has been chosen
            const subPropChosen = !!nodeData.firstSubProp;
            return { expectedColumnInfo: col, expectedIsSubProp: subPropChosen };
        }
        const targetColName = nodeData.targetPath?.[0] ?? "";
        const col = targetColumns.find((c) => c.logicalName === targetColName);
        const subPropChosen = (nodeData.targetPath?.length ?? 0) >= 2;
        return { expectedColumnInfo: col, expectedIsSubProp: subPropChosen };
    }, [isFirstPath, targetColumns, nodeData.firstColumn, nodeData.firstSubProp, nodeData.targetPath]);

    const hasExpected = nodeData.assertionKind === "be" || nodeData.assertionKind === "containSingle";
    const isThrow = nodeData.assertionKind === "throw";

    return (
        <div className={`${styles.node} ${selected ? styles.selected : ""}`}>
            <div className={styles.header}>
                <img src={assertIcon} alt="" className={styles.icon} />
                <Text size={200} weight="semibold" style={{ flex: 1 }}>Assert</Text>
                <Menu>
                    <MenuTrigger disableButtonEnhancement>
                        <MenuButton appearance="subtle" icon={<MoreHorizontalRegular />} size="small" />
                    </MenuTrigger>
                    <MenuPopover>
                        <MenuList>
                            <MenuItem
                                icon={<DeleteRegular />}
                                onClick={() => dispatch({ type: "REMOVE_NODE", payload: id })}
                            >
                                Delete
                            </MenuItem>
                        </MenuList>
                    </MenuPopover>
                </Menu>
            </div>

            <div className={styles.body}>
                {/* TARGET VAR */}
                <div className={styles.field}>
                    <Text size={100} style={{ minWidth: "55px", color: tokens.colorNeutralForeground3 }}>Target</Text>
                    <Combobox
                        size="small"
                        freeform
                        value={nodeData.targetVar ?? ""}
                        selectedOptions={nodeData.targetVar ? [nodeData.targetVar] : []}
                        onOptionSelect={(_ev, d) =>
                            dispatch({
                                type: "UPDATE_NODE",
                                payload: { id, data: { targetVar: d.optionText ?? d.optionValue } },
                            })
                        }
                        onChange={(ev) =>
                            dispatch({
                                type: "UPDATE_NODE",
                                payload: { id, data: { targetVar: ev.target.value } },
                            })
                        }
                        style={{ flex: 1, minWidth: "120px" }}
                    >
                        {varInfos.map((v) => (
                            <Option key={v.name} value={v.name}>{v.name}</Option>
                        ))}
                    </Combobox>
                </div>

                {/* TARGET MEMBER PATH — hidden for notNull and throw (targets the var directly) */}
                {selectedVarInfo && nodeData.assertionKind !== "notNull" && !isThrow && (
                    <div className={styles.field}>
                        <Text size={100} style={{ minWidth: "55px", color: tokens.colorNeutralForeground3 }}>Member</Text>
                        <MemberPicker id={id} nodeData={nodeData} selectedVarInfo={selectedVarInfo} />
                    </div>
                )}

                {/* KIND */}
                <div className={styles.field}>
                    <Text size={100} style={{ minWidth: "55px", color: tokens.colorNeutralForeground3 }}>Kind</Text>
                    <Dropdown
                        size="small"
                        value={nodeData.assertionKind}
                        selectedOptions={[nodeData.assertionKind]}
                        onOptionSelect={(_ev, d) =>
                            dispatch({
                                type: "UPDATE_NODE",
                                payload: { id, data: { assertionKind: d.optionValue } },
                            })
                        }
                        style={{ minWidth: "120px" }}
                    >
                        {assertionKinds.map((k) => (
                            <Option key={k} value={k}>{k}</Option>
                        ))}
                    </Dropdown>
                </div>
            </div>

            {/* EXPECTED — footer */}
            {hasExpected && (
                <div className={styles.footer}>
                    <Text size={100} style={{ minWidth: "55px", color: tokens.colorNeutralForeground3 }}>Expected</Text>
                    <ExpectedValueEditor
                        id={id}
                        nodeData={nodeData}
                        columnInfo={expectedColumnInfo}
                        isSubProp={expectedIsSubProp}
                    />
                </div>
            )}

            {/* THROW fields — footer */}
            {isThrow && (
                <div className={styles.footer} style={{ flexDirection: "column", alignItems: "stretch", gap: tokens.spacingVerticalXS }}>
                    <div style={{ display: "flex", alignItems: "center", gap: tokens.spacingHorizontalXS }}>
                        <Text size={100} style={{ minWidth: "80px", color: tokens.colorNeutralForeground3 }}>Exception</Text>
                        <Input
                            size="small"
                            value={nodeData.exceptionType ?? ""}
                            placeholder="InvalidPluginExecutionException"
                            onChange={(_ev, d) =>
                                dispatch({
                                    type: "UPDATE_NODE",
                                    payload: { id, data: { exceptionType: d.value } },
                                })
                            }
                            style={{ flex: 1 }}
                        />
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: tokens.spacingHorizontalXS }}>
                        <Text size={100} style={{ minWidth: "80px", color: tokens.colorNeutralForeground3 }}>Message</Text>
                        <Input
                            size="small"
                            value={nodeData.withMessage ?? ""}
                            placeholder="expected exception message"
                            onChange={(_ev, d) =>
                                dispatch({
                                    type: "UPDATE_NODE",
                                    payload: { id, data: { withMessage: d.value } },
                                })
                            }
                            style={{ flex: 1 }}
                        />
                    </div>
                </div>
            )}

            <Handle type="target" position={Position.Top} />
        </div>
    );
}
