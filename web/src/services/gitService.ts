import { api } from "./apiClient.ts";
import type {
    CloneRepositoryRequest,
    LoadBranchRequest,
    CreateBranchRequest,
    SaveChangesRequest,
    SubmitRequest,
} from "../models/requests.ts";
import type { CloneResult, RepositoryStatus } from "../models/responses.ts";

export const gitService = {
    clone(request: CloneRepositoryRequest): Promise<CloneResult> {
        return api.post("/git/clone", request);
    },

    getStatus(): Promise<RepositoryStatus> {
        return api.get("/git/status");
    },

    loadBranch(request: LoadBranchRequest): Promise<string> {
        return api.post("/git/load", request);
    },

    createBranch(request: CreateBranchRequest): Promise<string> {
        return api.post("/git/new", request);
    },

    saveChanges(request: SaveChangesRequest): Promise<string> {
        return api.post("/git/save", request);
    },

    publish(): Promise<string> {
        return api.post("/git/publish");
    },

    submit(request: SubmitRequest): Promise<string> {
        return api.post("/git/submit", request);
    },
};
