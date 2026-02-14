import { useCallback } from "react";
import { useProducerContext } from "../contexts/ProducerContext.tsx";
import { producerService } from "../services/producerService.ts";
import { ApiError } from "../services/apiClient.ts";
import type { CreateProducerRequest, UpdateProducerRequest } from "../models/requests.ts";

export function useProducers() {
    const { state, dispatch } = useProducerContext();

    const handleError = useCallback((err: unknown) => {
        const message = err instanceof ApiError ? err.body || err.message : String(err);
        dispatch({ type: "SET_ERROR", payload: message });
    }, [dispatch]);

    const fetchAll = useCallback(async () => {
        dispatch({ type: "LOADING" });
        try {
            const producers = await producerService.getAll();
            dispatch({ type: "SET_PRODUCERS", payload: producers });
        } catch (err) {
            handleError(err);
        }
    }, [dispatch, handleError]);

    const create = useCallback(async (request: CreateProducerRequest) => {
        dispatch({ type: "LOADING" });
        try {
            await producerService.create(request);
            await fetchAll();
        } catch (err) {
            handleError(err);
        }
    }, [dispatch, handleError, fetchAll]);

    const update = useCallback(async (request: UpdateProducerRequest) => {
        dispatch({ type: "LOADING" });
        try {
            await producerService.update(request);
            await fetchAll();
        } catch (err) {
            handleError(err);
        }
    }, [dispatch, handleError, fetchAll]);

    return {
        ...state,
        fetchAll,
        create,
        update,
        clearError: () => dispatch({ type: "CLEAR_ERROR" }),
    };
}
