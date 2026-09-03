import { apiRequest } from "./api";

export interface AuthResponse {
    userId: number;
    name: string;
    email: string;
    token: string;
    expiration: string;
    isAdmin: boolean;
    mustChangePassword: boolean;
}

export interface RegisterData {
    name: string;
    email: string;
    password: string;
    confirmPassword: string;
}

function getDeviceId() {
    const storageKey = "woven_device_id";
    let deviceId = localStorage.getItem(storageKey);
    if (!deviceId) {
        deviceId = crypto.randomUUID();
        localStorage.setItem(storageKey, deviceId);
    }
    return deviceId;
}

export interface LoginData {
    email: string;
    password: string;
}

export function register(data: RegisterData) {
    return apiRequest<AuthResponse>(
        "/api/auth/register",
        {
            method: "POST",
            body: JSON.stringify({ ...data, deviceId: getDeviceId() })
        }
    );
}

export function login(data: LoginData) {
    return apiRequest<AuthResponse>(
        "/api/auth/login",
        {
            method: "POST",
            body: JSON.stringify({ ...data, deviceId: getDeviceId() })
        }
    );
}

export function saveAuth(data: AuthResponse) {
    localStorage.setItem("token", data.token);

    localStorage.setItem(
        "user",
        JSON.stringify({
            userId: data.userId,
            name: data.name,
            email: data.email,
            isAdmin: data.isAdmin,
            mustChangePassword: data.mustChangePassword
        })
    );
}

export function logout() {
    const request = apiRequest<void>("/api/auth/logout", { method: "POST" }).catch(() => undefined);
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    return request;
}
