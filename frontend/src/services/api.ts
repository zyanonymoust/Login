export const API_BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:5436";

interface ApiError {
    message?: string;
}

export async function apiRequest<T>(
    path: string,
    options: RequestInit = {}
): Promise<T> {
    const token = localStorage.getItem("token");
    const response = await fetch(
        `${API_BASE_URL}${path}`,
        {
            ...options,
            headers: {
                "Content-Type": "application/json",
                ...(token ? { Authorization: `Bearer ${token}` } : {}),
                ...options.headers
            }
        }
    );

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

        throw new Error(
            error?.message ||
            `Request failed with status ${response.status}`
        );
    }

    return data as T;
}
