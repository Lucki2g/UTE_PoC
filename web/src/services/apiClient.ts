export class ApiError extends Error {
    readonly status: number;
    readonly statusText: string;
    readonly body: string;

    constructor(status: number, statusText: string, body: string) {
        super(`API ${status}: ${body || statusText}`);
        this.name = "ApiError";
        this.status = status;
        this.statusText = statusText;
        this.body = body;
    }
}

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "";
const API_KEY = import.meta.env.VITE_API_KEY ?? "apikey";

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const headers: Record<string, string> = {
        "X-Api-Key": API_KEY,
    };
    if (body !== undefined) {
        headers["Content-Type"] = "application/json";
    }

    const res = await fetch(`${API_BASE}${path}`, {
        method,
        headers,
        body: body !== undefined ? JSON.stringify(body) : undefined,
    });

    if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new ApiError(res.status, res.statusText, text);
    }

    const text = await res.text();
    if (!text) return undefined as T;
    return JSON.parse(text) as T;
}

export const api = {
    get: <T>(path: string) => request<T>("GET", path),
    post: <T>(path: string, body?: unknown) => request<T>("POST", path, body),
    put: <T>(path: string, body?: unknown) => request<T>("PUT", path, body),
    del: <T>(path: string, body?: unknown) => request<T>("DELETE", path, body),
};
