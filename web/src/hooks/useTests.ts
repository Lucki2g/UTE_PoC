import { useCallback } from "react";
import { useTestContext } from "../contexts/TestContext.tsx";
import { testService } from "../services/testService.ts";
import { ApiError } from "../services/apiClient.ts";
import type {
    CreateTestRequest,
    UpdateTestRequest,
    DeleteTestRequest,
    RunTestRequest,
    RunSubsetRequest,
} from "../models/requests.ts";

export function useTests() {
    const { state, dispatch } = useTestContext();

    const handleError = useCallback((err: unknown) => {
        const message = err instanceof ApiError ? err.body || err.message : String(err);
        dispatch({ type: "SET_ERROR", payload: message });
    }, [dispatch]);

    const handleBuildError = useCallback((output: string) => {
        dispatch({ type: "SET_BUILD_ERROR", payload: output });
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
        dispatch({ type: "RUNNING_TEST", payload: request.testName });
        try {
            const result = await testService.run(request);
            if (!result.testName) result.testName = request.testName;
            if (result.buildError) {
                handleBuildError(result.buildError);
                return undefined;
            }
            dispatch({ type: "SET_RESULT", payload: result });
            return result;
        } catch (err) {
            dispatch({ type: "DONE_RUNNING" });
            handleError(err);
            return undefined;
        }
    }, [dispatch, handleError, handleBuildError]);

    const runAll = useCallback(async () => {
        const allTestNames = state.tests.flatMap((t) =>
            t.methodNames.map((m) => `${t.className}.${m}`)
        );
        dispatch({ type: "RUNNING_TESTS", payload: allTestNames });
        try {
            const result = await testService.runAll();
            if (result.buildError) {
                handleBuildError(result.buildError);
                return undefined;
            }
            dispatch({ type: "SET_ALL_RESULTS", payload: result.results });
            return result;
        } catch (err) {
            dispatch({ type: "DONE_RUNNING" });
            handleError(err);
            return undefined;
        }
    }, [dispatch, handleError, handleBuildError, state.tests]);

    const runSubset = useCallback(async (filter: string) => {
        // Collect test names matching the filter (folder path prefix or class name)
        const matchingNames = state.tests
            .filter((t) => {
                const normalized = t.filePath.replace(/\\/g, "/");
                const folderPath = normalized.split("/").slice(0, -1).join("/");
                return folderPath.startsWith(filter) || t.className === filter || folderPath === filter;
            })
            .flatMap((t) => t.methodNames.map((m) => `${t.className}.${m}`));
        if (matchingNames.length === 0) return undefined;
        dispatch({ type: "RUNNING_TESTS", payload: matchingNames });
        try {
            const request: RunSubsetRequest = { filter };
            const result = await testService.runSubset(request);
            if (result.buildError) {
                handleBuildError(result.buildError);
                return undefined;
            }
            dispatch({ type: "SET_ALL_RESULTS", payload: result.results });
            return result;
        } catch (err) {
            dispatch({ type: "DONE_RUNNING" });
            handleError(err);
            return undefined;
        }
    }, [dispatch, handleError, handleBuildError, state.tests]);

    return {
        ...state,
        fetchAll,
        create,
        update,
        remove,
        run,
        runAll,
        runSubset,
        selectTest: (name: string | null) => dispatch({ type: "SELECT_TEST", payload: name }),
        clearError: () => dispatch({ type: "CLEAR_ERROR" }),
        clearBuildError: () => dispatch({ type: "CLEAR_BUILD_ERROR" }),
    };
}
