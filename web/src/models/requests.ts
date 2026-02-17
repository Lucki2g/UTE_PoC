import type { DslTestDefinition, DslProducerDefinition, DslExtensionDefinition } from "./dsl.ts";

// ─── Git Requests ────────────────────────────────────────────────────────────

export interface CloneRepositoryRequest {
    repositoryUrl: string;
}

export interface LoadBranchRequest {
    branchName: string;
}

export interface CreateBranchRequest {
    branchName: string;
}

export interface SaveChangesRequest {
    message: string;
}

export interface SubmitRequest {
    targetBranch: string;
    title: string;
    description?: string;
}

// ─── Metadata Requests ───────────────────────────────────────────────────────

export interface SyncMetadataRequest {
    environmentUrl?: string;
}

// ─── Test Requests ───────────────────────────────────────────────────────────

export interface CreateTestRequest {
    code: DslTestDefinition;
    className?: string;
    folder?: string;
}

export interface UpdateTestRequest {
    className: string;
    code: DslTestDefinition;
}

export interface DeleteTestRequest {
    className: string;
}

export interface RunTestRequest {
    testName: string;
}

// ─── Producer Requests ───────────────────────────────────────────────────────

export interface CreateProducerRequest {
    code: DslProducerDefinition;
}

export interface UpdateProducerRequest {
    entityName: string;
    code: DslProducerDefinition;
}

// ─── Extension Requests ──────────────────────────────────────────────────────

export interface CreateExtensionRequest {
    code: DslExtensionDefinition;
}

export interface UpdateExtensionRequest {
    entityName: string;
    code: DslExtensionDefinition;
}

export interface DeleteExtensionRequest {
    entityName: string;
}
