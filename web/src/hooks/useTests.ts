import { useCallback } from "react";
import { useTestContext } from "../contexts/TestContext.tsx";
import { testService } from "../services/testService.ts";
import { ApiError } from "../services/apiClient.ts";
import type {
    CreateTestRequest,
    UpdateTestRequest,
    DeleteTestRequest,
    RunTestRequest,
} from "../models/requests.ts";

export function useTests() {
    const { state, dispatch } = useTestContext();

    const handleError = useCallback((err: unknown) => {
        const message = err instanceof ApiError ? err.body || err.message : String(err);
        dispatch({ type: "SET_ERROR", payload: message });
    }, [dispatch]);

    const fetchAll = useCallback(async () => {
        dispatch({ type: "LOADING" });
        try {
            const tests = await testService.getAll();
            dispatch({ type: "SET_TESTS", payload: tests });
        } catch (err) {
            handleError(err);
        }
    }, [dispatch, handleError]);

    const create = useCallback(async (request: CreateTestRequest) => {
        dispatch({ type: "LOADING" });
        try {
            await testService.create(request);
            await fetchAll();
        } catch (err) {
            handleError(err);
        }
    }, [dispatch, handleError, fetchAll]);

    const update = useCallback(async (request: UpdateTestRequest) => {
        dispatch({ type: "LOADING" });
        try {
            await testService.update(request);
            await fetchAll();
        } catch (err) {
            handleError(err);
        }
    }, [dispatch, handleError, fetchAll]);

    const remove = useCallback(async (request: DeleteTestRequest) => {
        dispatch({ type: "LOADING" });
        try {
            await testService.remove(request);
            await fetchAll();
        } catch (err) {
            handleError(err);
        }
    }, [dispatch, handleError, fetchAll]);

    const run = useCallback(async (request: RunTestRequest) => {
        dispatch({ type: "RUNNING" });
        try {
            const result = await testService.run(request);
            dispatch({ type: "SET_RESULT", payload: result });
            return result;
        } catch (err) {
            handleError(err);
            return undefined;
        }
    }, [dispatch, handleError]);

    const runAll = useCallback(async () => {
        dispatch({ type: "RUNNING" });
        try {
            const result = await testService.runAll();
            dispatch({ type: "SET_ALL_RESULTS", payload: result.results });
            return result;
        } catch (err) {
            handleError(err);
            return undefined;
        }
    }, [dispatch, handleError]);

    return {
        ...state,
        fetchAll,
        create,
        update,
        remove,
        run,
        runAll,
        selectTest: (name: string | null) => dispatch({ type: "SELECT_TEST", payload: name }),
        clearError: () => dispatch({ type: "CLEAR_ERROR" }),
    };
}
