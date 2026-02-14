import { useCallback } from "react";
import { useMetadataContext } from "../contexts/MetadataContext.tsx";
import { metadataService } from "../services/metadataService.ts";
import { ApiError } from "../services/apiClient.ts";
import type { SyncMetadataRequest } from "../models/requests.ts";

export function useMetadata() {
    const { state, dispatch } = useMetadataContext();

    const handleError = useCallback((err: unknown) => {
        const message = err instanceof ApiError ? err.body || err.message : String(err);
        dispatch({ type: "SET_ERROR", payload: message });
    }, [dispatch]);

    const sync = useCallback(async (request?: SyncMetadataRequest) => {
        dispatch({ type: "SYNCING" });
        try {
            await metadataService.sync(request);
            dispatch({ type: "SYNC_COMPLETE" });
        } catch (err) {
            handleError(err);
        }
    }, [dispatch, handleError]);

    return {
        ...state,
        sync,
        clearError: () => dispatch({ type: "CLEAR_ERROR" }),
    };
}
