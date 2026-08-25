import { Navigate, Route, Routes } from "react-router";
import Login from "./pages/Login";
import Register from "./pages/Register";
import Dashboard from "./pages/Dashboard";
import ProtectedRoute from "./components/ProtectedRoute";
import Landing from "./pages/Landing";

function App() {
    return (
        <Routes>
            <Route
                path="/"
                element={<Landing />}
            />

            <Route
                path="/login"
                element={<Login />}
            />

            <Route
                path="/register"
                element={<Register />}
            />

            <Route element={<ProtectedRoute />}>
                <Route
                    path="/dashboard"
                    element={<Dashboard />}
                />
            </Route>

            <Route
                path="*"
                element={<Navigate to="/" replace />}
            />
        </Routes>
    );
}

export default App;
