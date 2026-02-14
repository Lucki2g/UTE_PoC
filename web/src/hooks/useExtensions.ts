import { useCallback } from "react";
import { useExtensionContext } from "../contexts/ExtensionContext.tsx";
import { extensionService } from "../services/extensionService.ts";
import { ApiError } from "../services/apiClient.ts";
import type {
    CreateExtensionRequest,
    UpdateExtensionRequest,
    DeleteExtensionRequest,
} from "../models/requests.ts";

export function useExtensions() {
    const { state, dispatch } = useExtensionContext();

    const handleError = useCallback((err: unknown) => {
        const message = err instanceof ApiError ? err.body || err.message : String(err);
        dispatch({ type: "SET_ERROR", payload: message });
    }, [dispatch]);

    const fetchAll = useCallback(async () => {
        dispatch({ type: "LOADING" });
        try {
            const extensions = await extensionService.getAll();
            dispatch({ type: "SET_EXTENSIONS", payload: extensions });
        } catch (err) {
            handleError(err);
        }
    }, [dispatch, handleError]);

    const create = useCallback(async (request: CreateExtensionRequest) => {
        dispatch({ type: "LOADING" });
        try {
            await extensionService.create(request);
            await fetchAll();
        } catch (err) {
            handleError(err);
        }
    }, [dispatch, handleError, fetchAll]);

    const update = useCallback(async (request: UpdateExtensionRequest) => {
        dispatch({ type: "LOADING" });
        try {
            await extensionService.update(request);
            await fetchAll();
        } catch (err) {
            handleError(err);
        }
    }, [dispatch, handleError, fetchAll]);

    const remove = useCallback(async (request: DeleteExtensionRequest) => {
        dispatch({ type: "LOADING" });
        try {
            await extensionService.remove(request);
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
        remove,
        clearError: () => dispatch({ type: "CLEAR_ERROR" }),
    };
}
