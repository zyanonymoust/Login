import {
    useCallback,
    useEffect,
    useRef,
    useState
} from "react";
import "./JumpGame.css";

type GameState =
    | "idle"
    | "playing"
    | "gameover";

interface Player {
    x: number;
    y: number;
    width: number;
    height: number;
    velocityX: number;
    velocityY: number;
    grounded: boolean;
}

interface Platform {
    id: number;
    x: number;
    y: number;
    width: number;
    height: number;
}

const GAME_WIDTH = 900;
const GAME_HEIGHT = 420;
const GRAVITY = 1150;
const MAX_CHARGE_TIME = 1200;
const MAX_POWER_HOLD_TIME = 2000;
const CHARGE_CYCLE_TIME =
    MAX_CHARGE_TIME +
    MAX_POWER_HOLD_TIME;

function createStartingPlatforms(): Platform[] {
    const platforms: Platform[] = [
        {
            id: 0,
            x: 50,
            y: 330,
            width: 160,
            height: 24
        }
    ];

    for (let index = 1; index < 9; index++) {
        const previous =
            platforms[platforms.length - 1];

        const gap =
            105 + Math.random() * 125;

        const width =
            110 + Math.random() * 75;

        const heightChange =
            (Math.random() - 0.5) * 90;

        const y = Math.max(
            225,
            Math.min(
                340,
                previous.y + heightChange
            )
        );

        platforms.push({
            id: index,
            x:
                previous.x +
                previous.width +
                gap,
            y,
            width,
            height: 24
        });
    }

    return platforms;
}

function JumpGame() {
    const canvasRef =
        useRef<HTMLCanvasElement>(null);

    const animationRef =
        useRef<number | null>(null);

    const previousTimeRef =
        useRef<number | null>(null);

    const gameStateRef =
        useRef<GameState>("idle");

    const playerRef = useRef<Player>({
        x: 105,
        y: 282,
        width: 38,
        height: 48,
        velocityX: 0,
        velocityY: 0,
        grounded: true
    });

    const platformsRef =
        useRef<Platform[]>(
            createStartingPlatforms()
        );

    const cameraXRef = useRef(0);
    const chargingRef = useRef(false);
    const chargeStartedAtRef = useRef(0);
    const chargeRef = useRef(0);
    const currentPlatformRef = useRef(0);
    const nextPlatformIdRef = useRef(9);
    const scoreRef = useRef(0);
    const bonusTextRef = useRef("");
    const bonusUntilRef = useRef(0);

    const [gameState, setGameState] =
        useState<GameState>("idle");

    const [score, setScore] = useState(0);

    const [highScore, setHighScore] =
        useState(() => {
            const storedScore =
                localStorage.getItem(
                    "jump-game-high-score"
                );

            const number = Number(storedScore);

            return Number.isFinite(number)
                ? number
                : 0;
        });

    const [charge, setCharge] = useState(0);

    const updateGameState = useCallback(
        (nextState: GameState) => {
            gameStateRef.current = nextState;
            setGameState(nextState);
        },
        []
    );

    const addPlatform = useCallback(() => {
        const platforms =
            platformsRef.current;

        const previous =
            platforms[platforms.length - 1];

        const gap =
            105 + Math.random() * 135;

        const width =
            105 + Math.random() * 80;

        const heightChange =
            (Math.random() - 0.5) * 95;

        const y = Math.max(
            220,
            Math.min(
                342,
                previous.y + heightChange
            )
        );

        platforms.push({
            id: nextPlatformIdRef.current,
            x:
                previous.x +
                previous.width +
                gap,
            y,
            width,
            height: 24
        });

        nextPlatformIdRef.current += 1;
    }, []);

    const resetGame = useCallback(() => {
        const platforms =
            createStartingPlatforms();

        platformsRef.current = platforms;

        playerRef.current = {
            x:
                platforms[0].x +
                platforms[0].width / 2 -
                19,
            y:
                platforms[0].y - 48,
            width: 38,
            height: 48,
            velocityX: 0,
            velocityY: 0,
            grounded: true
        };

        cameraXRef.current = 0;
        chargingRef.current = false;
        chargeStartedAtRef.current = 0;
        chargeRef.current = 0;
        currentPlatformRef.current = 0;
        nextPlatformIdRef.current = 9;
        scoreRef.current = 0;
        bonusTextRef.current = "";
        bonusUntilRef.current = 0;
        previousTimeRef.current = null;

        setScore(0);
        setCharge(0);
        updateGameState("playing");
    }, [updateGameState]);

    const beginCharge = useCallback(() => {
        if (
            gameStateRef.current !==
            "playing" ||
            !playerRef.current.grounded ||
            chargingRef.current
        ) {
            return;
        }

        chargingRef.current = true;
        chargeStartedAtRef.current =
            performance.now();

        chargeRef.current = 0;
        setCharge(0);
    }, []);

    const releaseCharge = useCallback(() => {
        if (
            gameStateRef.current !==
            "playing" ||
            !chargingRef.current ||
            !playerRef.current.grounded
        ) {
            return;
        }

        const finalCharge =
            chargeRef.current;

        chargingRef.current = false;
        chargeRef.current = 0;
        setCharge(0);

        if (finalCharge < 0.05) {
            return;
        }

        const player = playerRef.current;

        player.grounded = false;

        player.velocityX =
            130 + finalCharge * 470;

        player.velocityY =
            -(300 + finalCharge * 430);
    }, []);

    const finishGame = useCallback(() => {
        if (
            gameStateRef.current ===
            "gameover"
        ) {
            return;
        }

        chargingRef.current = false;
        chargeRef.current = 0;
        setCharge(0);

        const finalScore = scoreRef.current;

        setHighScore((previous) => {
            const nextHighScore =
                Math.max(
                    previous,
                    finalScore
                );

            localStorage.setItem(
                "jump-game-high-score",
                String(nextHighScore)
            );

            return nextHighScore;
        });

        updateGameState("gameover");
    }, [updateGameState]);

    useEffect(() => {
        function handleKeyDown(
            event: KeyboardEvent
        ) {
            if (event.code !== "Space") {
                return;
            }

            event.preventDefault();

            if (event.repeat) {
                return;
            }

            if (
                gameStateRef.current ===
                "idle" ||
                gameStateRef.current ===
                "gameover"
            ) {
                resetGame();
                return;
            }

            beginCharge();
        }

        function handleKeyUp(
            event: KeyboardEvent
        ) {
            if (event.code !== "Space") {
                return;
            }

            event.preventDefault();
            releaseCharge();
        }

        function handlePointerUp() {
            releaseCharge();
        }

        window.addEventListener(
            "keydown",
            handleKeyDown
        );

        window.addEventListener(
            "keyup",
            handleKeyUp
        );

        window.addEventListener(
            "pointerup",
            handlePointerUp
        );

        window.addEventListener(
            "pointercancel",
            handlePointerUp
        );

        return () => {
            window.removeEventListener(
                "keydown",
                handleKeyDown
            );

            window.removeEventListener(
                "keyup",
                handleKeyUp
            );

            window.removeEventListener(
                "pointerup",
                handlePointerUp
            );

            window.removeEventListener(
                "pointercancel",
                handlePointerUp
            );
        };
    }, [
        beginCharge,
        releaseCharge,
        resetGame,
    ]);

    useEffect(() => {
        const canvas = canvasRef.current;

        if (canvas === null) {
            return;
        }

        const context =
            canvas.getContext("2d");

        if (context === null) {
            return;
        }

        function resizeCanvas() {
            const pixelRatio = Math.min(
                window.devicePixelRatio || 1,
                2
            );

            canvas!.width =
                GAME_WIDTH * pixelRatio;

            canvas!.height =
                GAME_HEIGHT * pixelRatio;

            context!.setTransform(
                pixelRatio,
                0,
                0,
                pixelRatio,
                0,
                0
            );
        }

        function drawRoundedRectangle(
            x: number,
            y: number,
            width: number,
            height: number,
            radius: number
        ) {
            context!.beginPath();
            context!.roundRect(
                x,
                y,
                width,
                height,
                radius
            );
        }

        function drawBackground(
            animationTime: number
        ) {
            const gradient =
                context!.createLinearGradient(
                    0,
                    0,
                    0,
                    GAME_HEIGHT
                );

            gradient.addColorStop(
                0,
                "#111b42"
            );

            gradient.addColorStop(
                0.5,
                "#17245b"
            );

            gradient.addColorStop(
                1,
                "#301d64"
            );

            context!.fillStyle = gradient;

            context!.fillRect(
                0,
                0,
                GAME_WIDTH,
                GAME_HEIGHT
            );

            for (
                let index = 0;
                index < 42;
                index++
            ) {
                const starX =
                    (index * 137 -
                        cameraXRef.current *
                        0.08) %
                    GAME_WIDTH;

                const positiveX =
                    starX < 0
                        ? starX + GAME_WIDTH
                        : starX;

                const starY =
                    28 +
                    ((index * 83) %
                        215);

                const starSize =
                    index % 5 === 0
                        ? 2
                        : 1;

                const opacity =
                    0.35 +
                    Math.sin(
                        animationTime /
                        600 +
                        index
                    ) *
                    0.2;

                context!.beginPath();

                context!.arc(
                    positiveX,
                    starY,
                    starSize,
                    0,
                    Math.PI * 2
                );

                context!.fillStyle =
                    `rgba(255, 255, 255, ${opacity})`;

                context!.fill();
            }

            const moonGradient =
                context!.createRadialGradient(
                    745,
                    78,
                    8,
                    745,
                    78,
                    50
                );

            moonGradient.addColorStop(
                0,
                "rgba(255, 251, 221, 0.95)"
            );

            moonGradient.addColorStop(
                0.4,
                "rgba(255, 230, 150, 0.55)"
            );

            moonGradient.addColorStop(
                1,
                "rgba(255, 220, 130, 0)"
            );

            context!.fillStyle =
                moonGradient;

            context!.beginPath();

            context!.arc(
                745,
                78,
                50,
                0,
                Math.PI * 2
            );

            context!.fill();

            context!.fillStyle =
                "rgba(92, 68, 165, 0.28)";

            context!.beginPath();

            context!.moveTo(
                0,
                GAME_HEIGHT
            );

            context!.lineTo(0, 305);

            context!.lineTo(130, 250);
            context!.lineTo(260, 315);
            context!.lineTo(390, 242);
            context!.lineTo(520, 308);
            context!.lineTo(670, 245);
            context!.lineTo(810, 300);
            context!.lineTo(
                GAME_WIDTH,
                255
            );

            context!.lineTo(
                GAME_WIDTH,
                GAME_HEIGHT
            );

            context!.closePath();
            context!.fill();
        }

        function drawPlatforms() {
            const cameraX =
                cameraXRef.current;

            for (
                const platform of
                platformsRef.current
            ) {
                const screenX =
                    platform.x - cameraX;

                if (
                    screenX >
                    GAME_WIDTH + 100 ||
                    screenX +
                    platform.width <
                    -100
                ) {
                    continue;
                }

                context!.shadowColor =
                    "rgba(92, 239, 255, 0.38)";

                context!.shadowBlur = 16;

                const topGradient =
                    context!.createLinearGradient(
                        screenX,
                        platform.y,
                        screenX,
                        platform.y +
                        platform.height
                    );

                topGradient.addColorStop(
                    0,
                    "#67f4ff"
                );

                topGradient.addColorStop(
                    0.18,
                    "#28c9e8"
                );

                topGradient.addColorStop(
                    1,
                    "#1768b4"
                );

                drawRoundedRectangle(
                    screenX,
                    platform.y,
                    platform.width,
                    platform.height,
                    8
                );

                context!.fillStyle =
                    topGradient;

                context!.fill();

                context!.shadowBlur = 0;

                const baseGradient =
                    context!.createLinearGradient(
                        screenX,
                        platform.y +
                        platform.height,
                        screenX,
                        platform.y + 82
                    );

                baseGradient.addColorStop(
                    0,
                    "rgba(31, 99, 181, 0.92)"
                );

                baseGradient.addColorStop(
                    1,
                    "rgba(29, 24, 92, 0)"
                );

                context!.fillStyle =
                    baseGradient;

                context!.beginPath();

                context!.moveTo(
                    screenX + 9,
                    platform.y +
                    platform.height
                );

                context!.lineTo(
                    screenX +
                    platform.width -
                    9,
                    platform.y +
                    platform.height
                );

                context!.lineTo(
                    screenX +
                    platform.width -
                    24,
                    platform.y + 82
                );

                context!.lineTo(
                    screenX + 24,
                    platform.y + 82
                );

                context!.closePath();
                context!.fill();
            }
        }

        function drawPlayer(
            animationTime: number
        ) {
            const player =
                playerRef.current;

            const screenX =
                player.x -
                cameraXRef.current;

            let displayedWidth =
                player.width;

            let displayedHeight =
                player.height;

            let displayedY =
                player.y;

            if (
                chargingRef.current &&
                player.grounded
            ) {
                const visualCharge =
                    chargeRef.current;

                displayedHeight =
                    player.height -
                    visualCharge * 13;

                displayedWidth =
                    player.width +
                    visualCharge * 10;

                displayedY =
                    player.y +
                    player.height -
                    displayedHeight;
            }

            const playerX =
                screenX -
                (displayedWidth -
                    player.width) /
                2;

            context!.shadowColor =
                "rgba(142, 104, 255, 0.8)";

            context!.shadowBlur = 22;

            const playerGradient =
                context!.createLinearGradient(
                    playerX,
                    displayedY,
                    playerX +
                    displayedWidth,
                    displayedY +
                    displayedHeight
                );

            playerGradient.addColorStop(
                0,
                "#bca7ff"
            );

            playerGradient.addColorStop(
                0.5,
                "#8062ff"
            );

            playerGradient.addColorStop(
                1,
                "#4d38c8"
            );

            drawRoundedRectangle(
                playerX,
                displayedY,
                displayedWidth,
                displayedHeight,
                11
            );

            context!.fillStyle =
                playerGradient;

            context!.fill();

            context!.shadowBlur = 0;

            const eyeY =
                displayedY +
                displayedHeight * 0.34;

            context!.fillStyle = "#ffffff";

            context!.beginPath();

            context!.arc(
                playerX +
                displayedWidth * 0.34,
                eyeY,
                3.5,
                0,
                Math.PI * 2
            );

            context!.arc(
                playerX +
                displayedWidth * 0.67,
                eyeY,
                3.5,
                0,
                Math.PI * 2
            );

            context!.fill();

            context!.fillStyle = "#251c63";

            context!.beginPath();

            context!.arc(
                playerX +
                displayedWidth * 0.35,
                eyeY,
                1.5,
                0,
                Math.PI * 2
            );

            context!.arc(
                playerX +
                displayedWidth * 0.68,
                eyeY,
                1.5,
                0,
                Math.PI * 2
            );

            context!.fill();

            if (!player.grounded) {
                const trailOpacity =
                    0.32 +
                    Math.sin(
                        animationTime / 90
                    ) *
                    0.08;

                context!.fillStyle =
                    `rgba(123, 231, 255, ${trailOpacity})`;

                context!.beginPath();

                context!.ellipse(
                    playerX -
                    Math.max(
                        7,
                        player.velocityX *
                        0.035
                    ),
                    displayedY +
                    displayedHeight *
                    0.65,
                    20,
                    7,
                    0,
                    0,
                    Math.PI * 2
                );

                context!.fill();
            }
        }

        function drawBonus(
            animationTime: number
        ) {
            if (
                bonusTextRef.current ===
                "" ||
                animationTime >
                bonusUntilRef.current
            ) {
                return;
            }

            const remaining =
                (bonusUntilRef.current -
                    animationTime) /
                850;

            context!.save();

            context!.globalAlpha =
                Math.max(
                    0,
                    Math.min(1, remaining)
                );

            context!.fillStyle =
                "#ffef83";

            context!.font =
                "700 24px Inter, sans-serif";

            context!.textAlign = "center";

            context!.shadowColor =
                "rgba(255, 213, 70, 0.8)";

            context!.shadowBlur = 15;

            context!.fillText(
                bonusTextRef.current,
                GAME_WIDTH / 2,
                92 -
                (1 - remaining) * 24
            );

            context!.restore();
        }

        function updateGame(
            deltaTime: number,
            animationTime: number
        ) {
            if (
                gameStateRef.current !==
                "playing"
            ) {
                return;
            }

            const player =
                playerRef.current;

            if (
                chargingRef.current &&
                player.grounded
            ) {
                const elapsed =
                    animationTime -
                    chargeStartedAtRef.current;

                const cycleElapsed =
                    elapsed %
                    CHARGE_CYCLE_TIME;

                const nextCharge =
                    cycleElapsed >=
                        MAX_CHARGE_TIME
                        ? 1
                        : cycleElapsed /
                        MAX_CHARGE_TIME;

                chargeRef.current =
                    nextCharge;

                setCharge(nextCharge);
            }

            if (!player.grounded) {
                const previousBottom =
                    player.y +
                    player.height;

                player.velocityY +=
                    GRAVITY * deltaTime;

                player.x +=
                    player.velocityX *
                    deltaTime;

                player.y +=
                    player.velocityY *
                    deltaTime;

                const currentBottom =
                    player.y +
                    player.height;

                if (player.velocityY >= 0) {
                    for (
                        const platform of
                        platformsRef.current
                    ) {
                        const overlapLeft =
                            Math.max(
                                player.x,
                                platform.x
                            );

                        const overlapRight =
                            Math.min(
                                player.x +
                                player.width,
                                platform.x +
                                platform.width
                            );

                        const horizontalOverlap =
                            Math.max(
                                0,
                                overlapRight -
                                overlapLeft
                            );

                        const horizontalHit =
                            horizontalOverlap >
                            player.width * 0.5;

                        const verticalHit =
                            previousBottom <=
                            platform.y + 5 &&
                            currentBottom >=
                            platform.y;

                        if (
                            !horizontalHit ||
                            !verticalHit
                        ) {
                            continue;
                        }

                        player.y =
                            platform.y -
                            player.height;

                        player.velocityX = 0;
                        player.velocityY = 0;
                        player.grounded = true;

                        if (
                            platform.id >
                            currentPlatformRef.current
                        ) {
                            const skippedPlatforms =
                                platform.id -
                                currentPlatformRef.current;

                            currentPlatformRef.current =
                                platform.id;

                            const playerCentre =
                                player.x +
                                player.width /
                                2;

                            const platformCentre =
                                platform.x +
                                platform.width /
                                2;

                            const centreDistance =
                                Math.abs(
                                    playerCentre -
                                    platformCentre
                                );

                            const perfect =
                                centreDistance <=
                                16;

                            const scorePerPlatform =
                                perfect ? 3 : 2;

                            const addedScore =
                                skippedPlatforms *
                                scorePerPlatform;

                            scoreRef.current +=
                                addedScore;

                            setScore(
                                scoreRef.current
                            );

                            bonusTextRef.current =
                                perfect
                                    ? `PERFECT +${addedScore}`
                                    : `SKIP +${addedScore}`;

                            bonusUntilRef.current =
                                animationTime +
                                850;

                            while (
                                platformsRef
                                    .current
                                    .length <
                                platform.id + 10
                            ) {
                                addPlatform();
                            }
                        }

                        break;
                    }
                }
            }

            const targetCamera = Math.max(
                0,
                player.x - 270
            );

            cameraXRef.current +=
                (targetCamera -
                    cameraXRef.current) *
                Math.min(
                    1,
                    deltaTime * 5
                );

            if (
                player.y >
                GAME_HEIGHT + 100 ||
                player.x +
                player.width <
                cameraXRef.current - 80
            ) {
                finishGame();
            }
        }

        function draw(
            animationTime: number
        ) {
            const previousTime =
                previousTimeRef.current ??
                animationTime;

            const deltaTime = Math.min(
                0.032,
                (animationTime -
                    previousTime) /
                1000
            );

            previousTimeRef.current =
                animationTime;

            updateGame(
                deltaTime,
                animationTime
            );

            context!.clearRect(
                0,
                0,
                GAME_WIDTH,
                GAME_HEIGHT
            );

            drawBackground(animationTime);
            drawPlatforms();
            drawPlayer(animationTime);
            drawBonus(animationTime);

            animationRef.current =
                window.requestAnimationFrame(
                    draw
                );
        }

        resizeCanvas();

        animationRef.current =
            window.requestAnimationFrame(
                draw
            );

        window.addEventListener(
            "resize",
            resizeCanvas
        );

        return () => {
            if (
                animationRef.current !== null
            ) {
                window.cancelAnimationFrame(
                    animationRef.current
                );
            }

            window.removeEventListener(
                "resize",
                resizeCanvas
            );
        };
    }, [addPlatform, finishGame]);

    const chargePercent =
        Math.round(charge * 100);

    const chargeBarPercent =
        chargePercent;

    return (
        <article className="jump-game-card">
            <div className="jump-game-header">
                <div className="jump-game-title">
                    <div className="jump-game-icon">
                        🟪
                    </div>

                    <div>
                        <h3>Jump Adventure</h3>

                        <p>
                            Hold to charge and release
                            to jump.
                        </p>
                    </div>
                </div>

                <div className="jump-game-scores">
                    <div>
                        <span>Score</span>
                        <strong>{score}</strong>
                    </div>

                    <div>
                        <span>Best</span>
                        <strong>{highScore}</strong>
                    </div>
                </div>
            </div>

            <div
                className="jump-game-stage"
                onPointerDown={(event) => {
                    if (
                        event.button !== 0 &&
                        event.pointerType ===
                        "mouse"
                    ) {
                        return;
                    }

                    event.preventDefault();

                    if (
                        gameStateRef.current ===
                        "idle" ||
                        gameStateRef.current ===
                        "gameover"
                    ) {
                        resetGame();
                        return;
                    }

                    beginCharge();
                }}
                onContextMenu={(event) =>
                    event.preventDefault()
                }
            >
                <canvas
                    ref={canvasRef}
                    className="jump-game-canvas"
                    width={GAME_WIDTH}
                    height={GAME_HEIGHT}
                />

                {gameState === "idle" && (
                    <div className="jump-game-overlay">
                        <span className="jump-game-overlay-label">
                            Mini Arcade
                        </span>

                        <h4>Ready to Jump?</h4>

                        <p>
                            Land on every platform and
                            aim for the centre.
                        </p>

                        <button
                            type="button"
                            onClick={resetGame}
                        >
                            Play Game
                        </button>
                    </div>
                )}

                {gameState ===
                    "gameover" && (
                        <div className="jump-game-overlay game-over">
                            <span className="jump-game-overlay-label">
                                Game Over
                            </span>

                            <h4>{score} Points</h4>

                            <p>
                                Best score: {highScore}
                            </p>

                            <button
                                type="button"
                                onClick={resetGame}
                            >
                                Play Again
                            </button>
                        </div>
                    )}

                {gameState ===
                    "playing" && (
                        <>
                            <div className="jump-game-help">
                                Hold mouse or Space
                            </div>

                            <div className="charge-container">
                                <div className="charge-label">
                                    <span>
                                        Jump power
                                    </span>

                                    <strong>
                                        {chargePercent}%
                                    </strong>
                                </div>

                                <div className="charge-track">
                                    <div
                                        className="charge-fill"
                                        style={{
                                            width:
                                                `${chargeBarPercent}%`
                                        }}
                                    />
                                </div>
                            </div>
                        </>
                    )}
            </div>

            <div className="jump-game-instructions">
                <span>
                    🖱️ Hold and release
                </span>

                <span>
                    ⌨️ Space bar
                </span>

                <span>
                    🎯 Centre landing +3
                </span>
            </div>
        </article>
    );
}

export default JumpGame;