import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router";
import JumpGame from "../components/JumpGame";
import "./dashboard.css";

interface CurrentUser {
    userId?: number;
    name?: string;
    email?: string;
}

interface TrailParticle {
    x: number;
    y: number;
    size: number;
    speedX: number;
    speedY: number;
    color: string;
    createdAt: number;
    lifetime: number;
}

type ReactionState =
    | "idle"
    | "waiting"
    | "ready"
    | "finished"
    | "early";

function Dashboard() {
    const navigate = useNavigate();

    const canvasRef = useRef<HTMLCanvasElement>(null);
    const reactionTimer = useRef<number | null>(null);

    const [currentUser] = useState<CurrentUser>(() => {
        try {
            return JSON.parse(
                localStorage.getItem("user") || "{}"
            );
        } catch {
            return {};
        }
    });

    const [darkMode, setDarkMode] = useState(() =>
        localStorage.getItem("dashboard-theme") === "dark"
    );

    const [effectsEnabled, setEffectsEnabled] =
        useState(() =>
            localStorage.getItem(
                "dashboard-effects"
            ) !== "off"
        );

    const [currentTime, setCurrentTime] = useState(
        new Date()
    );

    const [secretNumber, setSecretNumber] = useState(
        () => Math.floor(Math.random() * 100) + 1
    );

    const [guess, setGuess] = useState("");

    const [guessMessage, setGuessMessage] = useState(
        "Enter a number from 1 to 100."
    );

    const [guessAttempts, setGuessAttempts] = useState(0);

    const [guessCompleted, setGuessCompleted] =
        useState(false);

    const [reactionState, setReactionState] =
        useState<ReactionState>("idle");

    const [reactionStart, setReactionStart] = useState(0);

    const [reactionTime, setReactionTime] =
        useState<number | null>(null);

    const [bestReaction, setBestReaction] =
        useState<number | null>(null);

    useEffect(() => {
        const timer = window.setInterval(() => {
            setCurrentTime(new Date());
        }, 1000);

        return () => {
            window.clearInterval(timer);
        };
    }, []);

    useEffect(() => {
        localStorage.setItem(
            "dashboard-theme",
            darkMode ? "dark" : "light"
        );
    }, [darkMode]);

    useEffect(() => {
        localStorage.setItem(
            "dashboard-effects",
            effectsEnabled ? "on" : "off"
        );
    }, [effectsEnabled]);

    useEffect(() => {
        const canvasElement = canvasRef.current;

        if (canvasElement === null) {
            return;
        }

        const contextValue =
            canvasElement.getContext("2d");

        if (contextValue === null) {
            return;
        }

        const canvas: HTMLCanvasElement =
            canvasElement;

        const context: CanvasRenderingContext2D =
            contextValue;

        context.clearRect(
            0,
            0,
            window.innerWidth,
            window.innerHeight
        );

        if (!effectsEnabled) {
            return;
        }

        const colours = [
            "#00ffd5",
            "#00d9ff",
            "#00a8ff",
            "#865cff",
            "#d600ff",
            "#ffffff"
        ];

        let particles: TrailParticle[] = [];
        let animationId = 0;

        let previousX: number | null = null;
        let previousY: number | null = null;

        function resizeCanvas() {
            const pixelRatio = Math.min(
                window.devicePixelRatio || 1,
                2
            );

            canvas.width =
                window.innerWidth * pixelRatio;

            canvas.height =
                window.innerHeight * pixelRatio;

            canvas.style.width =
                `${window.innerWidth}px`;

            canvas.style.height =
                `${window.innerHeight}px`;

            context.setTransform(
                pixelRatio,
                0,
                0,
                pixelRatio,
                0,
                0
            );
        }

        function createParticle(
            x: number,
            y: number,
            small: boolean
        ) {
            const angle =
                Math.random() * Math.PI * 2;

            const speed =
                Math.random() * 0.3 + 0.04;

            particles.push({
                x:
                    x +
                    (Math.random() - 0.5) *
                    (small ? 16 : 8),
                y:
                    y +
                    (Math.random() - 0.5) *
                    (small ? 16 : 8),
                size: small
                    ? Math.random() * 1.6 + 0.5
                    : Math.random() * 2.8 + 1.3,
                speedX:
                    Math.cos(angle) * speed,
                speedY:
                    Math.sin(angle) * speed,
                color:
                    colours[
                    Math.floor(
                        Math.random() *
                        colours.length
                    )
                    ],
                createdAt: performance.now(),
                lifetime:
                    Math.random() * 300 + 1200
            });
        }

        function handlePointerMove(
            event: PointerEvent
        ) {
            const currentX = event.clientX;
            const currentY = event.clientY;

            if (
                previousX === null ||
                previousY === null
            ) {
                previousX = currentX;
                previousY = currentY;

                createParticle(
                    currentX,
                    currentY,
                    false
                );

                return;
            }

            const distanceX =
                currentX - previousX;

            const distanceY =
                currentY - previousY;

            const distance = Math.sqrt(
                distanceX * distanceX +
                distanceY * distanceY
            );

            const steps = Math.min(
                24,
                Math.max(
                    1,
                    Math.ceil(distance / 9)
                )
            );

            for (
                let step = 1;
                step <= steps;
                step++
            ) {
                const progress = step / steps;

                const particleX =
                    previousX +
                    distanceX * progress;

                const particleY =
                    previousY +
                    distanceY * progress;

                createParticle(
                    particleX,
                    particleY,
                    false
                );

                if (Math.random() < 0.18) {
                    createParticle(
                        particleX,
                        particleY,
                        true
                    );
                }
            }

            previousX = currentX;
            previousY = currentY;

            if (particles.length > 550) {
                particles =
                    particles.slice(-550);
            }
        }

        function handlePointerLeave() {
            previousX = null;
            previousY = null;
        }

        function animate(animationTime: number) {
            context.clearRect(
                0,
                0,
                window.innerWidth,
                window.innerHeight
            );

            particles = particles.filter(
                (particle) => {
                    const age =
                        animationTime -
                        particle.createdAt;

                    if (
                        age >=
                        particle.lifetime
                    ) {
                        return false;
                    }

                    const remainingLife =
                        1 -
                        age /
                        particle.lifetime;

                    particle.x +=
                        particle.speedX;

                    particle.y +=
                        particle.speedY;

                    particle.speedX *= 0.99;
                    particle.speedY *= 0.99;

                    const displayedSize =
                        particle.size *
                        (0.25 +
                            remainingLife * 0.9);

                    context.beginPath();

                    context.arc(
                        particle.x,
                        particle.y,
                        displayedSize,
                        0,
                        Math.PI * 2
                    );

                    context.fillStyle =
                        particle.color;

                    context.globalAlpha =
                        Math.pow(
                            remainingLife,
                            1.35
                        );

                    context.shadowBlur =
                        5 +
                        remainingLife * 15;

                    context.shadowColor =
                        particle.color;

                    context.fill();

                    return true;
                }
            );

            context.globalAlpha = 1;
            context.shadowBlur = 0;

            animationId =
                window.requestAnimationFrame(
                    animate
                );
        }

        resizeCanvas();

        animationId =
            window.requestAnimationFrame(animate);

        window.addEventListener(
            "resize",
            resizeCanvas
        );

        window.addEventListener(
            "pointermove",
            handlePointerMove
        );

        document.addEventListener(
            "pointerleave",
            handlePointerLeave
        );

        return () => {
            window.cancelAnimationFrame(
                animationId
            );

            window.removeEventListener(
                "resize",
                resizeCanvas
            );

            window.removeEventListener(
                "pointermove",
                handlePointerMove
            );

            document.removeEventListener(
                "pointerleave",
                handlePointerLeave
            );

            context.clearRect(
                0,
                0,
                window.innerWidth,
                window.innerHeight
            );
        };
    }, [effectsEnabled]);

    useEffect(() => {
        return () => {
            if (reactionTimer.current !== null) {
                window.clearTimeout(
                    reactionTimer.current
                );
            }
        };
    }, []);

    function logout() {
        localStorage.removeItem("token");
        localStorage.removeItem("user");

        navigate("/login", {
            replace: true
        });
    }

    function handleGuess() {
        const number = Number(guess);

        if (
            guess.trim() === "" ||
            number < 1 ||
            number > 100
        ) {
            setGuessMessage(
                "Please enter a number from 1 to 100."
            );

            return;
        }

        const nextAttempts =
            guessAttempts + 1;

        setGuessAttempts(nextAttempts);

        if (number < secretNumber) {
            setGuessMessage(
                "Too low. Try a higher number."
            );
        } else if (number > secretNumber) {
            setGuessMessage(
                "Too high. Try a lower number."
            );
        } else {
            setGuessMessage(
                `Correct! You found ${secretNumber} in ${nextAttempts} attempts.`
            );

            setGuessCompleted(true);
        }

        setGuess("");
    }

    function resetGuessGame() {
        setSecretNumber(
            Math.floor(Math.random() * 100) + 1
        );

        setGuess("");
        setGuessAttempts(0);
        setGuessCompleted(false);

        setGuessMessage(
            "A new number has been generated."
        );
    }

    function startReactionGame() {
        if (reactionTimer.current !== null) {
            window.clearTimeout(
                reactionTimer.current
            );
        }

        setReactionState("waiting");
        setReactionTime(null);

        const delay =
            Math.floor(Math.random() * 3000) +
            2000;

        reactionTimer.current =
            window.setTimeout(() => {
                setReactionStart(Date.now());
                setReactionState("ready");
            }, delay);
    }

    function handleReactionClick() {
        if (reactionState === "waiting") {
            if (
                reactionTimer.current !== null
            ) {
                window.clearTimeout(
                    reactionTimer.current
                );
            }

            setReactionState("early");
            return;
        }

        if (reactionState === "ready") {
            const result =
                Date.now() - reactionStart;

            setReactionTime(result);
            setReactionState("finished");

            setBestReaction((previous) => {
                if (
                    previous === null ||
                    result < previous
                ) {
                    return result;
                }

                return previous;
            });
        }
    }

    function getReactionRating() {
        if (reactionTime === null) {
            return "";
        }

        if (reactionTime < 200) {
            return "Lightning fast!";
        }

        if (reactionTime < 300) {
            return "Excellent reaction!";
        }

        if (reactionTime < 400) {
            return "Good reaction!";
        }

        return "Keep practising!";
    }

    return (
        <div
            className={
                darkMode
                    ? "dashboard-page dark"
                    : "dashboard-page"
            }
        >
            <canvas
                ref={canvasRef}
                className="particle-canvas"
            />

            <header className="dashboard-header">
                <button
                    type="button"
                    className={
                        effectsEnabled
                            ? "effects-toggle-button active"
                            : "effects-toggle-button"
                    }
                    onClick={() =>
                        setEffectsEnabled(
                            (previous) => !previous
                        )
                    }
                >
                    <span className="effects-status-dot" />
                    Meteor Tail
                </button>

                <div className="header-actions">
                    <button
                        className="theme-button"
                        onClick={() =>
                            setDarkMode(
                                (previous) => !previous
                            )
                        }
                    >
                        {darkMode
                            ? "☀️ Light"
                            : "🌙 Dark"}
                    </button>

                    <button
                        className="logout-button"
                        onClick={logout}
                    >
                        Logout
                    </button>
                </div>
            </header>

            <main className="dashboard-content">
                <section className="welcome-card">
                    <div className="welcome-content">
                        <span className="welcome-label">
                            Welcome back
                        </span>

                        <h1>
                            Hello,{" "}
                            {currentUser.name ||
                                "User"}{" "}
                            👋
                        </h1>

                        <p>
                            Your account is active and
                            securely authenticated.
                        </p>

                        <div className="user-details">
                            <div>
                                <span>Email</span>

                                <strong>
                                    {currentUser.email ||
                                        "Not available"}
                                </strong>
                            </div>

                            <div>
                                <span>User ID</span>

                                <strong>
                                    {currentUser.userId ||
                                        "—"}
                                </strong>
                            </div>
                        </div>
                    </div>

                    <div className="welcome-visual">
                        <div className="profile-circle">
                            {(currentUser.name || "U")
                                .charAt(0)
                                .toUpperCase()}
                        </div>

                        <div className="online-status">
                            <span />
                            Online
                        </div>
                    </div>
                </section>

                <section className="information-grid">
                    <article className="information-card">
                        <div className="information-icon purple">
                            🔐
                        </div>

                        <div>
                            <span>Security</span>
                            <strong>JWT Protected</strong>
                        </div>
                    </article>

                    <article className="information-card">
                        <div className="information-icon blue">
                            📅
                        </div>

                        <div>
                            <span>Today</span>

                            <strong>
                                {currentTime.toLocaleDateString(
                                    undefined,
                                    {
                                        day: "numeric",
                                        month: "short",
                                        year: "numeric"
                                    }
                                )}
                            </strong>
                        </div>
                    </article>

                    <article className="information-card">
                        <div className="information-icon orange">
                            🕐
                        </div>

                        <div>
                            <span>Local Time</span>

                            <strong>
                                {currentTime.toLocaleTimeString(
                                    [],
                                    {
                                        hour: "2-digit",
                                        minute: "2-digit",
                                        second: "2-digit"
                                    }
                                )}
                            </strong>
                        </div>
                    </article>
                </section>

                <section className="section-heading">
                    <div>
                        <span>Mini Arcade</span>
                        <h2>Take a quick break</h2>
                    </div>

                    <p>
                        Test your timing, luck and
                        reaction speed.
                    </p>
                </section>

                <section className="game-grid">
                    <article className="game-card">
                        <div className="game-heading">
                            <div className="game-icon">
                                🎯
                            </div>

                            <div>
                                <h3>
                                    Guess the Number
                                </h3>

                                <p>
                                    Find the hidden number.
                                </p>
                            </div>
                        </div>

                        <div className="guess-range">
                            <span>1</span>
                            <div className="range-line" />
                            <span>100</span>
                        </div>

                        <div className="game-input-row">
                            <input
                                type="number"
                                min="1"
                                max="100"
                                value={guess}
                                disabled={guessCompleted}
                                placeholder="Your guess"
                                onChange={(event) =>
                                    setGuess(
                                        event.target.value
                                    )
                                }
                                onKeyDown={(event) => {
                                    if (
                                        event.key ===
                                        "Enter" &&
                                        !guessCompleted
                                    ) {
                                        handleGuess();
                                    }
                                }}
                            />

                            <button
                                onClick={
                                    guessCompleted
                                        ? resetGuessGame
                                        : handleGuess
                                }
                            >
                                {guessCompleted
                                    ? "New Game"
                                    : "Guess"}
                            </button>
                        </div>

                        <div
                            className={
                                guessCompleted
                                    ? "game-message success"
                                    : "game-message"
                            }
                        >
                            <p>{guessMessage}</p>

                            <span>
                                Attempts:{" "}
                                {guessAttempts}
                            </span>
                        </div>
                    </article>

                    <article className="game-card">
                        <div className="game-heading">
                            <div className="game-icon">
                                ⚡
                            </div>

                            <div>
                                <h3>Reaction Speed</h3>

                                <p>
                                    Click when the colour
                                    changes.
                                </p>
                            </div>
                        </div>

                        <div className="reaction-score">
                            <div>
                                <span>Latest</span>

                                <strong>
                                    {reactionTime === null
                                        ? "—"
                                        : `${reactionTime} ms`}
                                </strong>
                            </div>

                            <div>
                                <span>Best</span>

                                <strong>
                                    {bestReaction === null
                                        ? "—"
                                        : `${bestReaction} ms`}
                                </strong>
                            </div>
                        </div>

                        {reactionState === "idle" && (
                            <button
                                className="reaction-start"
                                onClick={
                                    startReactionGame
                                }
                            >
                                Start Reaction Test
                            </button>
                        )}

                        {reactionState ===
                            "waiting" && (
                                <button
                                    className="reaction-zone waiting"
                                    onClick={
                                        handleReactionClick
                                    }
                                >
                                    Wait for green...
                                </button>
                            )}

                        {reactionState === "ready" && (
                            <button
                                className="reaction-zone ready"
                                onClick={
                                    handleReactionClick
                                }
                            >
                                CLICK NOW!
                            </button>
                        )}

                        {reactionState === "early" && (
                            <div className="reaction-result early">
                                <strong>
                                    Too early!
                                </strong>

                                <span>
                                    Wait until the area
                                    turns green.
                                </span>

                                <button
                                    onClick={
                                        startReactionGame
                                    }
                                >
                                    Try Again
                                </button>
                            </div>
                        )}

                        {reactionState ===
                            "finished" && (
                                <div className="reaction-result finished">
                                    <strong>
                                        {reactionTime} ms
                                    </strong>

                                    <span>
                                        {getReactionRating()}
                                    </span>

                                    <button
                                        onClick={
                                            startReactionGame
                                        }
                                    >
                                        Play Again
                                    </button>
                                </div>
                            )}
                    </article>

                    <JumpGame />
                </section>
            </main>
        </div>
    );
}

export default Dashboard;