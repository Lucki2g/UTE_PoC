import { useCallback } from "react";
import { useGitContext } from "../contexts/GitContext.tsx";
import { gitService } from "../services/gitService.ts";
import { ApiError } from "../services/apiClient.ts";
import type {
    CloneRepositoryRequest,
    LoadBranchRequest,
    CreateBranchRequest,
    SaveChangesRequest,
    SubmitRequest,
} from "../models/requests.ts";

export function useGit() {
    const { state, dispatch } = useGitContext();

    const handleError = useCallback((err: unknown) => {
        const message = err instanceof ApiError ? err.body || err.message : String(err);
        dispatch({ type: "SET_ERROR", payload: message });
    }, [dispatch]);

    const fetchStatus = useCallback(async () => {
        dispatch({ type: "LOADING" });
        try {
            const status = await gitService.getStatus();
            dispatch({ type: "SET_STATUS", payload: status });
        } catch (err) {
            handleError(err);
        }
    }, [dispatch, handleError]);

    const clone = useCallback(async (request: CloneRepositoryRequest) => {
        dispatch({ type: "LOADING" });
        try {
            const result = await gitService.clone(request);
            dispatch({
                type: "SET_STATUS",
                payload: { cloned: true, branch: result.branch, clean: true, path: result.path },
            });
        } catch (err) {
            handleError(err);
        }
    }, [dispatch, handleError]);

    const loadBranch = useCallback(async (request: LoadBranchRequest) => {
        dispatch({ type: "LOADING" });
        try {
            await gitService.loadBranch(request);
            await fetchStatus();
        } catch (err) {
            handleError(err);
        }
    }, [dispatch, handleError, fetchStatus]);

    const createBranch = useCallback(async (request: CreateBranchRequest) => {
        dispatch({ type: "LOADING" });
        try {
            await gitService.createBranch(request);
            await fetchStatus();
        } catch (err) {
            handleError(err);
        }
    }, [dispatch, handleError, fetchStatus]);

    const save = useCallback(async (request: SaveChangesRequest) => {
        dispatch({ type: "LOADING" });
        try {
            await gitService.saveChanges(request);
            await fetchStatus();
        } catch (err) {
            handleError(err);
        }
    }, [dispatch, handleError, fetchStatus]);

    const publish = useCallback(async () => {
        dispatch({ type: "LOADING" });
        try {
            await gitService.publish();
            await fetchStatus();
        } catch (err) {
            handleError(err);
        }
    }, [dispatch, handleError, fetchStatus]);

    const submit = useCallback(async (request: SubmitRequest) => {
        dispatch({ type: "LOADING" });
        try {
            const url = await gitService.submit(request);
            await fetchStatus();
            return url;
        } catch (err) {
            handleError(err);
            return undefined;
        }
    }, [dispatch, handleError, fetchStatus]);

    return {
        ...state,
        fetchStatus,
        clone,
        loadBranch,
        createBranch,
        save,
        publish,
        submit,
        clearError: () => dispatch({ type: "CLEAR_ERROR" }),
    };
}
