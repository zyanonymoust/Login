export const API_BASE_URL = import.meta.env.VITE_API_URL || "";

interface ApiError {
    message?: string;
}

const wait = (milliseconds: number) => new Promise((resolve) => window.setTimeout(resolve, milliseconds));

export async function apiRequest<T>(
    path: string,
    options: RequestInit = {}
): Promise<T> {
    const method = (options.method || "GET").toUpperCase();
    const attempts = method === "GET" ? 2 : 1;
    let response: Response | null = null;
    let lastError: unknown;

    for (let attempt = 0; attempt < attempts; attempt++) {
        const token = localStorage.getItem("token");
        const controller = new AbortController();
        const timeout = window.setTimeout(() => controller.abort(), 15000);
        try {
            response = await fetch(`${API_BASE_URL}${path}`, {
                ...options,
                signal: controller.signal,
                headers: {
                    ...(options.body instanceof FormData ? {} : { "Content-Type": "application/json" }),
                    ...(token ? { Authorization: `Bearer ${token}` } : {}),
                    ...options.headers
                }
            });
            if (response.status < 500 || attempt === attempts - 1) break;
        } catch (error) {
            lastError = error;
            if (attempt === attempts - 1) {
                if (error instanceof DOMException && error.name === "AbortError") throw new Error("The server took too long to respond. Please try again.");
                throw new Error("Woven cannot connect to the server. Check your connection and try again.");
            }
        } finally {
            window.clearTimeout(timeout);
        }
        await wait(500);
    }

    if (!response) throw lastError instanceof Error ? lastError : new Error("Woven cannot connect to the server.");

    const text = await response.text();

    let data: T | ApiError | null = null;

    if (text) {
        try {
            data = JSON.parse(text);
        } catch {
            data = {
                message: text
            };
        }
    }

    if (!response.ok) {
        const error = data as ApiError | null;

        if (response.status === 401) {
            if (path === "/api/auth/login") {
                throw new Error(error?.message || "Invalid email or password.");
            }
            throw new Error("Your session has expired. Please sign in again.");
        }
        if (response.status === 429) throw new Error(error?.message || "Too many requests. Please wait a moment and try again.");
        if (response.status >= 500) throw new Error(error?.message || "Woven is temporarily unavailable. Please try again shortly.");
        throw new Error(error?.message || `Request failed with status ${response.status}`);
    }

    return data as T;
}
