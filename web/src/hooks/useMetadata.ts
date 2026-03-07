import { useCallback } from "react";
import { useMetadataContext } from "../contexts/MetadataContext.tsx";
import type { SyncProgressEvent } from "../contexts/MetadataContext.tsx";
import { api } from "../services/apiClient.ts";
import type { SyncMetadataRequest } from "../models/requests.ts";

export function useMetadata() {
    const { state, dispatch } = useMetadataContext();

    const sync = useCallback(async (request?: SyncMetadataRequest) => {
        dispatch({ type: "SYNCING" });

        const params = new URLSearchParams();
        if (request?.environmentUrl) params.set("environmentUrl", request.environmentUrl);

        let response: Response;
        try {
            response = await api.stream("/metadata/sync/stream", params);
        } catch (err) {
            dispatch({ type: "SET_ERROR", payload: String(err) });
            return;
        }

        if (!response.ok || !response.body) {
            dispatch({ type: "SET_ERROR", payload: `Request failed: ${response.status} ${response.statusText}` });
            return;
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        try {
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                buffer += decoder.decode(value, { stream: true });

                // SSE lines are separated by \n\n
                const parts = buffer.split("\n\n");
                buffer = parts.pop() ?? "";

                for (const part of parts) {
                    const dataLine = part.split("\n").find(l => l.startsWith("data: "));
                    if (!dataLine) continue;

                    const json = dataLine.slice(6).trim();
                    let evt: SyncProgressEvent & { done?: boolean };
                    try {
                        evt = JSON.parse(json);
                    } catch {
                        continue;
                    }

                    if (evt.done) {
                        dispatch({ type: "SYNC_COMPLETE" });
                        return;
                    }

                    dispatch({ type: "SYNC_PROGRESS", payload: evt });

                    // Stop reading on error phase
                    if (evt.status === "error") {
                        dispatch({ type: "SET_ERROR", payload: evt.detail ?? evt.message });
                        return;
                    }
                }
            }
        } catch (err) {
            dispatch({ type: "SET_ERROR", payload: String(err) });
            return;
        }

        dispatch({ type: "SYNC_COMPLETE" });
    }, [dispatch]);

    return {
        ...state,
        sync,
        clearError: () => dispatch({ type: "CLEAR_ERROR" }),
    };
}
