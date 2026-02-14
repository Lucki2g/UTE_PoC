import { api } from "./apiClient.ts";
import type { SyncMetadataRequest } from "../models/requests.ts";

export const metadataService = {
    sync(request?: SyncMetadataRequest): Promise<string> {
        return api.post("/metadata/sync", request ?? {});
    },
};
