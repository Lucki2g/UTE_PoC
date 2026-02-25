import type { DslValueExpression } from "../../../models/dsl.ts";
import type { ServiceNodeData } from "../../../models/builder.ts";

// ─── Operation kind maps ──────────────────────────────────────────────────────

/** Maps UI enum → DSL kind string. Used by the generator. */
export function mapOperationKind(op: string): string {
    const map: Record<string, string> = {
        Create:          "create",
        Update:          "update",
        RetrieveSingle:  "retrieveFirstOrDefault",
        RetrieveList:    "retrieveMultiple",
        Delete:          "delete",
    };
    return map[op] ?? op.toLowerCase();
}

/** Maps DSL kind string → UI enum. Used by the loader. */
export function mapOperationBack(kind: string): ServiceNodeData["operation"] {
    const map: Record<string, ServiceNodeData["operation"]> = {
        create:                  "Create",
        update:                  "Update",
        retrieveSingle:          "RetrieveSingle",
        retrieveFirstOrDefault:  "RetrieveSingle",
        retrieveMultiple:        "RetrieveList",
        delete:                  "Delete",
    };
    return map[kind] ?? "Create";
}

// ─── Value parsing ────────────────────────────────────────────────────────────

/** Parses a raw string into a typed DslValueExpression. Used by the generator. */
export function parseStringValue(raw: string): DslValueExpression {
    if (raw === "true" || raw === "false") {
        return { type: "boolean", value: raw === "true" };
    }
    if (raw === "null") {
        return { type: "null" };
    }
    const num = Number(raw);
    if (!isNaN(num) && raw.trim() !== "") {
        return { type: "number", value: num };
    }
    return { type: "string", value: raw };
}
