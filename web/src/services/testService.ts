import { api } from "./apiClient.ts";
import type {
    CreateTestRequest,
    UpdateTestRequest,
    DeleteTestRequest,
    RunTestRequest,
} from "../models/requests.ts";
import type { TestMetadata, TestRunResult, TestRunAllResult } from "../models/responses.ts";

export const testService = {
    getAll(): Promise<TestMetadata[]> {
        return api.get("/tests/");
    },

    create(request: CreateTestRequest): Promise<string> {
        return api.put("/tests/", request);
    },

    update(request: UpdateTestRequest): Promise<string> {
        return api.post("/tests/", request);
    },

    remove(request: DeleteTestRequest): Promise<string> {
        return api.del("/tests/", request);
    },

    run(request: RunTestRequest): Promise<TestRunResult> {
        return api.post("/tests/run", request);
    },

    runAll(): Promise<TestRunAllResult> {
        return api.post("/tests/run/all");
    },
};
