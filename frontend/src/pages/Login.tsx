import { useState, type FormEvent } from "react";
import {
    Link,
    useNavigate,
    useSearchParams
} from "react-router";
import { login, saveAuth } from "../services/auth";
import "./Auth.css";

function Login() {
    const navigate = useNavigate();

    const [searchParams, setSearchParams] =
        useSearchParams();

    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [showPassword, setShowPassword] =
        useState(false);
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(false);

    const registered =
        searchParams.get("registered") === "true";

    async function handleSubmit(
        event: FormEvent<HTMLFormElement>
    ) {
        event.preventDefault();
        setError("");

        try {
            setLoading(true);

            const result = await login({
                email,
                password
            });

            saveAuth(result);
            navigate("/dashboard");
        } catch (requestError) {
            setError(
                requestError instanceof Error
                    ? requestError.message
                    : "Login failed."
            );
        } finally {
            setLoading(false);
        }
    }

    function closePopup() {
        setSearchParams({}, { replace: true });
    }

    return (
        <main className="auth-page">
            <div className="shape shape-one" />
            <div className="shape shape-two" />

            {registered && (
                <div className="popup-overlay">
                    <div className="popup-card">
                        <div className="popup-icon">✓</div>

                        <h2>Account Created</h2>

                        <p>
                            Registration successful. You can now log in.
                        </p>

                        <button
                            type="button"
                            onClick={closePopup}
                        >
                            Continue to Login
                        </button>
                    </div>
                </div>
            )}

            <section className="auth-card">
                <aside className="auth-brand">
                    <div className="brand-content">
                        <div className="brand-icon">✓</div>

                        <h2>TaskFlow</h2>

                        <p>
                            Sign in and continue managing your tasks.
                        </p>

                        <ul>
                            <li>✓ Organize daily tasks</li>
                            <li>✓ Track your progress</li>
                            <li>✓ Stay productive</li>
                        </ul>
                    </div>
                </aside>

                <div className="auth-form-panel">
                    <p className="auth-label">
                        WELCOME BACK
                    </p>

                    <h1>Login</h1>

                    <p className="auth-subtitle">
                        Enter your details to continue.
                    </p>

                    <form
                        className="auth-form"
                        onSubmit={handleSubmit}
                    >
                        <div className="form-group">
                            <label htmlFor="email">Email</label>

                            <input
                                id="email"
                                type="email"
                                placeholder="name@example.com"
                                value={email}
                                onChange={(event) =>
                                    setEmail(event.target.value)
                                }
                                required
                            />
                        </div>

                        <div className="form-group">
                            <label htmlFor="password">
                                Password
                            </label>

                            <div className="password-field">
                                <input
                                    id="password"
                                    type={
                                        showPassword
                                            ? "text"
                                            : "password"
                                    }
                                    placeholder="Enter your password"
                                    value={password}
                                    onChange={(event) =>
                                        setPassword(
                                            event.target.value
                                        )
                                    }
                                    required
                                />

                                <button
                                    type="button"
                                    className="password-toggle"
                                    onClick={() =>
                                        setShowPassword(
                                            (current) => !current
                                        )
                                    }
                                >
                                    {showPassword ? "Hide" : "Show"}
                                </button>
                            </div>
                        </div>

                        {error && (
                            <div className="auth-error">
                                {error}
                            </div>
                        )}

                        <button
                            className="auth-submit"
                            type="submit"
                            disabled={loading}
                        >
                            {loading
                                ? "Logging in..."
                                : "Login"}
                        </button>
                    </form>

                    <p className="auth-switch">
                        No account?{" "}
                        <Link to="/register">Register</Link>
                    </p>
                </div>
            </section>
        </main>
    );
}

export default Login;