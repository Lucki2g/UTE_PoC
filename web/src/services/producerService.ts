import { api } from "./apiClient.ts";
import type { CreateProducerRequest, UpdateProducerRequest } from "../models/requests.ts";
import type { ProducerMetadata } from "../models/responses.ts";

export const producerService = {
    getAll(): Promise<ProducerMetadata[]> {
        return api.get("/producers/");
    },

    create(request: CreateProducerRequest): Promise<string> {
        return api.put("/producers/", request);
    },

    update(request: UpdateProducerRequest): Promise<string> {
        return api.post("/producers/", request);
    },
};
