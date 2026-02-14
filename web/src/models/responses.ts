import type { DslTestDefinition, DslProducerDefinition, DslExtensionDefinition } from "./dsl.ts";

// ─── Git Responses ───────────────────────────────────────────────────────────

export interface CloneResult {
    message: string;
    branch: string;
    path: string;
}

export interface RepositoryStatus {
    cloned: boolean;
    branch?: string;
    clean?: boolean;
    changedFiles?: number;
    path: string;
}

// ─── Test Responses ──────────────────────────────────────────────────────────

export interface TestRunResult {
    testName?: string;
    passed: boolean;
    duration: string;
    trace?: string;
    errorMessage?: string;
}

export interface TestRunAllResult {
    total: number;
    passed: number;
    failed: number;
    results: TestRunResult[];
}

export interface TestMetadata {
    className: string;
    filePath: string;
    methodNames: string[];
    lastModified: string;
    dsl?: DslTestDefinition;
}

// ─── Producer Responses ──────────────────────────────────────────────────────

export interface ProducerMetadata {
    entityName: string;
    filePath: string;
    methodNames: string[];
    dsl?: DslProducerDefinition;
}

// ─── Extension Responses ─────────────────────────────────────────────────────

export interface ExtensionMetadata {
    entityName: string;
    filePath: string;
    methods: ExtensionMethodInfo[];
    dsl?: DslExtensionDefinition;
}

export interface ExtensionMethodInfo {
    name: string;
    signature: string;
}
