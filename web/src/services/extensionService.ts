import { api } from "./apiClient.ts";
import type {
    CreateExtensionRequest,
    UpdateExtensionRequest,
    DeleteExtensionRequest,
} from "../models/requests.ts";
import type { ExtensionMetadata } from "../models/responses.ts";

export const extensionService = {
    getAll(): Promise<ExtensionMetadata[]> {
        return api.get("/extensions/");
    },

    create(request: CreateExtensionRequest): Promise<string> {
        return api.put("/extensions/", request);
    },

    update(request: UpdateExtensionRequest): Promise<string> {
        return api.post("/extensions/", request);
    },

    remove(request: DeleteExtensionRequest): Promise<string> {
        return api.del("/extensions/", request);
    },
};
