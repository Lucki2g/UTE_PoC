// ─── DSL Value Expressions ───────────────────────────────────────────────────

export type DslValueExpression =
    | DslStringValue
    | DslNumberValue
    | DslBooleanValue
    | DslGuidValue
    | DslNullValue
    | DslEnumValue
    | DslEnumNumberValue
    | DslInterpolationValue
    | DslRefValue;

export interface DslStringValue {
    type: "string";
    value: string;
}

export interface DslNumberValue {
    type: "number";
    value: number;
}

export interface DslBooleanValue {
    type: "boolean";
    value: boolean;
}

export interface DslGuidValue {
    type: "guid";
    value: string;
}

export interface DslNullValue {
    type: "null";
}

export interface DslEnumValue {
    type: "enum";
    enumType: string;
    member: string;
}

export interface DslEnumNumberValue {
    type: "enumNumber";
    enumType: string;
    value: number;
}

export interface DslInterpolationValue {
    type: "interpolation";
    template: string;
}

export interface DslRefValue {
    type: "ref";
    ref: DslRefExpr;
}

export interface DslRefExpr {
    kind: string;
    id?: string;
    member?: string;
    call?: string;
}

// ─── DSL Test Definition ─────────────────────────────────────────────────────

export interface DslTestDefinition {
    dslVersion: string;
    language: string;
    test: DslTest;
}

export interface DslTest {
    framework: string;
    kind: string;
    name: string;
    async: boolean;
    traits?: Record<string, string[]>;
    timeoutMs?: number;
    ignore?: DslIgnore;
    arrange: DslArrange;
    act: DslAct;
    assert: DslAssert;
    extensions?: unknown;
}

export interface DslIgnore {
    reason: string;
}

// ─── Arrange ─────────────────────────────────────────────────────────────────

export interface DslArrange {
    bindings: DslBinding[];
}

export interface DslBinding {
    id: string;
    var: string;
    kind: string;
    producer: DslProducerCall;
    build: boolean;
    expose?: DslExpose;
}

export interface DslProducerCall {
    call: string;
    with: DslWithMutation[];
}

export interface DslWithMutation {
    path: string;
    value: DslValueExpression;
}

export interface DslExpose {
    entityMember: string;
    entityReferenceCall: string;
}

// ─── Act ─────────────────────────────────────────────────────────────────────

export interface DslAct {
    resultVar?: string;
    operation: DslOperation;
}

export interface DslOperation {
    kind: string;
    genericType?: string;
    entity?: DslEntityRef;
    id?: DslValueExpression;
    awaited: boolean;
    relationshipName?: string;
    target?: DslValueExpression;
    related?: DslRelated;
    unawaitedVariant: boolean;
}

export interface DslEntityRef {
    fromBinding: string;
    member: string;
}

export interface DslRelated {
    kind: string;
    value: DslValueExpression;
}

// ─── Assert ──────────────────────────────────────────────────────────────────

export interface DslAssert {
    retrievals: DslRetrieval[];
    assertions: DslAssertion[];
}

export interface DslRetrieval {
    var: string;
    kind: string;
    entitySet: string;
    alias: string;
    where: DslWhereExpression;
    select?: unknown;
}

export interface DslWhereExpression {
    op: string;
    left?: DslMemberExpr;
    right?: DslValueExpression;
    items?: DslWhereExpression[];
}

export interface DslMemberExpr {
    kind: string;
    root: string;
    path: string[];
}

export interface DslAssertion {
    kind: string;
    target: DslAssertionTarget;
    expected?: DslValueExpression;
    predicate?: DslPredicate;
}

export interface DslAssertionTarget {
    kind: string;
    name?: string;
    rootVar?: string;
    path?: string[];
}

export interface DslPredicate {
    alias: string;
    op: string;
    left: DslPredicateLeft;
    right: DslValueExpression;
}

export interface DslPredicateLeft {
    path: string[];
}

// ─── DSL Producer Definition ─────────────────────────────────────────────────

export interface DslProducerDefinition {
    draft?: DslDraft;
}

export interface DslDraft {
    entity?: string;
    useExisting: boolean;
    ensure?: DslEnsureField[];
}

export interface DslEnsureField {
    field?: string;
    value?: DslFieldValue;
}

export interface DslFieldValue {
    enum?: string;
    gen?: string;
    literal?: string;
}

// ─── DSL Extension Definition ────────────────────────────────────────────────

export interface DslExtensionDefinition {
    entity?: string;
    methods?: DslExtensionMethod[];
}

export interface DslExtensionMethod {
    name?: string;
    set?: DslSetField[];
}

export interface DslSetField {
    field?: string;
    value?: DslFieldValue;
}

// ─── DSL Diagnostics ─────────────────────────────────────────────────────────

export interface DslDiagnostic {
    code: string;
    message: string;
    location?: DslDiagnosticLocation;
}

export interface DslDiagnosticLocation {
    section?: string;
    hint?: string;
}

export const DslDiagnosticCodes = {
    UnsupportedAssertion: "UNSUPPORTED_ASSERTION",
    UnsupportedLinqShape: "UNSUPPORTED_LINQ_SHAPE",
    MultipleActCalls: "MULTIPLE_ACT_CALLS",
    MissingAaaSections: "MISSING_AAA_SECTIONS",
    AmbiguousTestFramework: "AMBIGUOUS_TEST_FRAMEWORK",
    UnsupportedTimeoutXunit: "UNSUPPORTED_TIMEOUT_XUNIT",
    UnknownOperationKind: "UNKNOWN_OPERATION_KIND",
    UnresolvedReference: "UNRESOLVED_REFERENCE",
} as const;
