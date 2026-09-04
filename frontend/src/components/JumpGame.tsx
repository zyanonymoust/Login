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
    | "paused"
    | "gameover";

type PlatformType =
    | "normal"
    | "moving"
    | "bounce"
    | "fragile"
    | "ice"
    | "temporary";

type ChargeSource = "keyboard" | "stage" | "slider";

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
    type: PlatformType;
    originX: number;
    phase: number;
    landedAt?: number;
    broken?: boolean;
}

interface Collectible {
    platformId: number;
    x: number;
    y: number;
    collected: boolean;
}

interface GameStats {
    jumps: number;
    centres: number;
    longestJump: number;
    bestStreak: number;
    stars: number;
}

interface GhostPoint {
    time: number;
    x: number;
    y: number;
}

const GAME_WIDTH = 900;
const GAME_HEIGHT = 420;
const GRAVITY = 1150;
const MAX_CHARGE_TIME = 1200;
const MAX_POWER_HOLD_TIME = 1000;

function getPlatformType(id: number): PlatformType {
    if (id < 5) return "normal";
    if (id % 17 === 0) return "temporary";
    if (id % 13 === 0) return "ice";
    if (id % 11 === 0) return "fragile";
    if (id % 7 === 0) return "bounce";
    if (id % 5 === 0) return "moving";
    return "normal";
}

function makePlatform(
    id: number,
    x: number,
    y: number,
    width: number
): Platform {
    return {
        id,
        x,
        y,
        width,
        height: 24,
        type: getPlatformType(id),
        originX: x,
        phase: Math.random() * Math.PI * 2
    };
}

function createStartingPlatforms(): Platform[] {
    const platforms: Platform[] = [
        makePlatform(0, 50, 330, 160)
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

        platforms.push(
            makePlatform(
                index,
                previous.x + previous.width + gap,
                y,
                width
            )
        );
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
    const manualChargingRef = useRef(false);
    const chargeExpiredRef = useRef(false);
    const chargeStartedAtRef = useRef(0);
    const chargeRef = useRef(0);
    const chargeSourceRef = useRef<ChargeSource | null>(null);
    const keyboardChargeHeldRef = useRef(false);
    const stageChargeHeldRef = useRef(false);
    const doubleJumpAvailableRef = useRef(false);
    const currentPlatformRef = useRef(0);
    const nextPlatformIdRef = useRef(9);
    const scoreRef = useRef(0);
    const centreStreakRef = useRef(0);
    const statsRef = useRef<GameStats>({
        jumps: 0,
        centres: 0,
        longestJump: 0,
        bestStreak: 0,
        stars: 0
    });
    const collectiblesRef = useRef<Collectible[]>([]);
    const ghostRef = useRef<GhostPoint[]>([]);
    const ghostRecordingRef = useRef<GhostPoint[]>([]);
    const runStartedAtRef = useRef(0);
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
    const [centreStreak, setCentreStreak] = useState(0);
    const [stats, setStats] = useState<GameStats>(statsRef.current);
    const [achievements, setAchievements] = useState<string[]>([]);

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

        const difficulty = Math.min(1, scoreRef.current / 500);

        const gap =
            105 + difficulty * 35 + Math.random() * 135;

        const width =
            105 - difficulty * 25 + Math.random() * 80;

        const heightChange =
            (Math.random() - 0.5) * 95;

        const y = Math.max(
            220,
            Math.min(
                342,
                previous.y + heightChange
            )
        );

        const id = nextPlatformIdRef.current;
        const platform = makePlatform(
            id,
            previous.x + previous.width + gap,
            y,
            width
        );

        platforms.push(platform);

        if (id > 5 && id % 3 === 0) {
            collectiblesRef.current.push({
                platformId: id,
                x: platform.x + platform.width / 2,
                y: platform.y - 46,
                collected: false
            });
        }

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
        manualChargingRef.current = false;
        chargeExpiredRef.current = false;
        chargeStartedAtRef.current = 0;
        chargeRef.current = 0;
        chargeSourceRef.current = null;
        keyboardChargeHeldRef.current = false;
        stageChargeHeldRef.current = false;
        doubleJumpAvailableRef.current = false;
        currentPlatformRef.current = 0;
        nextPlatformIdRef.current = 9;
        scoreRef.current = 0;
        centreStreakRef.current = 0;
        statsRef.current = {
            jumps: 0,
            centres: 0,
            longestJump: 0,
            bestStreak: 0,
            stars: 0
        };
        collectiblesRef.current = [];
        ghostRecordingRef.current = [];
        try {
            const storedGhost = JSON.parse(
                localStorage.getItem("jump-game-ghost") ?? "[]"
            ) as Array<Partial<GhostPoint>>;
            ghostRef.current = Array.isArray(storedGhost)
                ? storedGhost
                    .filter((point) =>
                        typeof point.x === "number" &&
                        typeof point.y === "number"
                    )
                    .map((point, index) => ({
                        time: typeof point.time === "number"
                            ? point.time
                            : index * 40,
                        x: point.x as number,
                        y: point.y as number
                    }))
                : [];
        } catch {
            ghostRef.current = [];
        }
        bonusTextRef.current = "";
        bonusUntilRef.current = 0;
        previousTimeRef.current = null;
        runStartedAtRef.current = performance.now();

        setScore(0);
        setCharge(0);
        setCentreStreak(0);
        setStats(statsRef.current);
        setAchievements([]);
        updateGameState("playing");
    }, [updateGameState]);

    const beginCharge = useCallback((source: ChargeSource) => {
        if (
            gameStateRef.current !==
            "playing" ||
            !playerRef.current.grounded ||
            chargingRef.current
            || chargeExpiredRef.current
        ) {
            return;
        }

        chargingRef.current = true;
        chargeSourceRef.current = source;
        chargeStartedAtRef.current =
            performance.now();

        chargeRef.current = 0;
        setCharge(0);
    }, []);

    const releaseCharge = useCallback((source: ChargeSource) => {
        if (chargeSourceRef.current !== source) {
            return;
        }

        if (chargeExpiredRef.current) {
            chargeExpiredRef.current = false;
            chargeSourceRef.current = null;
            return;
        }

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
        manualChargingRef.current = false;
        chargeSourceRef.current = null;
        chargeSourceRef.current = null;
        chargeExpiredRef.current = false;
        chargeRef.current = 0;
        setCharge(0);

        if (finalCharge <= 0) {
            return;
        }

        const player = playerRef.current;
        const currentPlatform = platformsRef.current.find(
            (platform) => platform.id === currentPlatformRef.current
        );
        const effectivePower =
            Math.pow(finalCharge, 1.15) *
            (currentPlatform?.type === "ice" ? 1.15 : 1);

        if (currentPlatform?.type === "fragile") {
            currentPlatform.broken = true;
        }

        player.grounded = false;

        player.velocityX =
            effectivePower * 740;

        player.velocityY =
            -(effectivePower * 840);
        doubleJumpAvailableRef.current = true;

        statsRef.current = {
            ...statsRef.current,
            jumps: statsRef.current.jumps + 1
        };
        setStats(statsRef.current);
    }, []);

    const performDoubleJump = useCallback(() => {
        const player = playerRef.current;
        if (
            gameStateRef.current !== "playing" ||
            player.grounded ||
            !doubleJumpAvailableRef.current
        ) {
            return;
        }

        doubleJumpAvailableRef.current = false;
        player.velocityY = -620;
        bonusTextRef.current = "SECRET DOUBLE JUMP ↑";
        bonusUntilRef.current = performance.now() + 850;
    }, []);

    const finishGame = useCallback(() => {
        if (
            gameStateRef.current ===
            "gameover"
        ) {
            return;
        }

        chargingRef.current = false;
        manualChargingRef.current = false;
        chargeRef.current = 0;
        setCharge(0);

        const finalScore = scoreRef.current;

        if (ghostRecordingRef.current.length > 0) {
            localStorage.setItem(
                "jump-game-ghost",
                JSON.stringify(ghostRecordingRef.current)
            );
        }

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

    const togglePause = useCallback(() => {
        if (gameStateRef.current === "playing") {
            chargingRef.current = false;
            manualChargingRef.current = false;
            chargeSourceRef.current = null;
            updateGameState("paused");
        } else if (gameStateRef.current === "paused") {
            previousTimeRef.current = null;
            updateGameState("playing");
        }
    }, [updateGameState]);

    useEffect(() => {
        function handleKeyDown(
            event: KeyboardEvent
        ) {
            if (event.code === "ArrowUp") {
                event.preventDefault();
                if (!event.repeat) performDoubleJump();
                return;
            }

            if (event.code === "KeyP" || event.code === "Escape") {
                event.preventDefault();
                togglePause();
                return;
            }

            if (event.code !== "Space") {
                return;
            }

            event.preventDefault();
            keyboardChargeHeldRef.current = true;

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

            beginCharge("keyboard");
        }

        function handleKeyUp(
            event: KeyboardEvent
        ) {
            if (event.code !== "Space") {
                return;
            }

            event.preventDefault();
            keyboardChargeHeldRef.current = false;
            releaseCharge("keyboard");
        }

        function handlePointerUp() {
            stageChargeHeldRef.current = false;
            releaseCharge("stage");
        }

        function handleBlur() {
            chargingRef.current = false;
            manualChargingRef.current = false;
            chargeSourceRef.current = null;
            keyboardChargeHeldRef.current = false;
            stageChargeHeldRef.current = false;
            chargeExpiredRef.current = false;
            chargeRef.current = 0;
            setCharge(0);
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

        window.addEventListener("blur", handleBlur);

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

            window.removeEventListener("blur", handleBlur);
        };
    }, [
        beginCharge,
        releaseCharge,
        resetGame,
        togglePause,
        performDoubleJump,
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
            const scene = Math.floor(scoreRef.current / 100) % 3;
            const palettes = [
                ["#111b42", "#17245b", "#301d64"],
                ["#291449", "#77365f", "#ef8a62"],
                ["#07162f", "#12375a", "#087f8c"]
            ];
            const palette = palettes[scene];
            const gradient =
                context!.createLinearGradient(
                    0,
                    0,
                    0,
                    GAME_HEIGHT
                );

            gradient.addColorStop(
                0,
                palette[0]
            );

            gradient.addColorStop(
                0.5,
                palette[1]
            );

            gradient.addColorStop(
                1,
                palette[2]
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
                if (platform.broken) continue;
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

                const platformColours: Record<PlatformType, [string, string, string]> = {
                    normal: ["#67f4ff", "#28c9e8", "#1768b4"],
                    moving: ["#ffe477", "#f5a623", "#be6712"],
                    bounce: ["#91ffb8", "#31d77d", "#158c58"],
                    fragile: ["#ffb0bd", "#f06378", "#a9294c"],
                    ice: ["#e8fbff", "#88dffa", "#478dc4"],
                    temporary: ["#d8b6ff", "#9f70ed", "#6740aa"]
                };
                const colours = platformColours[platform.type];

                context!.shadowColor = colours[1];

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
                    colours[0]
                );

                topGradient.addColorStop(
                    0.18,
                    colours[1]
                );

                topGradient.addColorStop(
                    1,
                    colours[2]
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

                const targetWidth = Math.min(34, platform.width * 0.28);
                context!.fillStyle = "rgba(255,255,255,0.8)";
                context!.shadowColor = "#ffffff";
                context!.shadowBlur = 12;
                context!.fillRect(
                    screenX + platform.width / 2 - targetWidth / 2,
                    platform.y + 2,
                    targetWidth,
                    4
                );

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

        function drawCollectibles() {
            for (const star of collectiblesRef.current) {
                if (star.collected) continue;
                const screenX = star.x - cameraXRef.current;
                context!.save();
                context!.translate(screenX, star.y);
                context!.rotate(performance.now() / 700);
                context!.fillStyle = "#ffe66d";
                context!.shadowColor = "#ffd23f";
                context!.shadowBlur = 14;
                context!.font = "700 22px sans-serif";
                context!.textAlign = "center";
                context!.fillText("★", 0, 7);
                context!.restore();
            }
        }

        function drawGhost(animationTime: number) {
            const elapsed = animationTime - runStartedAtRef.current;
            let point: GhostPoint | undefined;
            let pointIndex = -1;
            for (let index = 0; index < ghostRef.current.length; index++) {
                const candidate = ghostRef.current[index];
                if (candidate.time > elapsed) break;
                point = candidate;
                pointIndex = index;
            }
            if (!point) return;
            const ghostX = point.x - cameraXRef.current;
            const ghostWidth = playerRef.current.width;
            const ghostHeight = playerRef.current.height;
            context!.save();

            const trailStart = Math.max(0, pointIndex - 28);
            for (let index = trailStart; index < pointIndex; index += 3) {
                const trailPoint = ghostRef.current[index];
                const progress = (index - trailStart + 1) /
                    Math.max(1, pointIndex - trailStart);
                context!.globalAlpha = 0.04 + progress * 0.12;
                context!.fillStyle = "#d8ceff";
                context!.beginPath();
                context!.arc(
                    trailPoint.x - cameraXRef.current + ghostWidth / 2,
                    trailPoint.y + ghostHeight / 2,
                    2 + progress * 1.5,
                    0,
                    Math.PI * 2
                );
                context!.fill();
            }

            context!.globalAlpha = 0.24;
            context!.shadowColor = "#c8baff";
            context!.shadowBlur = 8;
            drawRoundedRectangle(
                ghostX,
                point.y,
                ghostWidth,
                ghostHeight,
                10
            );
            context!.lineWidth = 2;
            context!.strokeStyle = "#e6e0ff";
            context!.stroke();
            context!.shadowBlur = 0;

            context!.globalAlpha = 0.32;
            context!.fillStyle = "#e6e0ff";
            context!.beginPath();
            context!.arc(
                ghostX + ghostWidth * 0.34,
                point.y + ghostHeight * 0.35,
                2.5,
                0,
                Math.PI * 2
            );
            context!.arc(
                ghostX + ghostWidth * 0.67,
                point.y + ghostHeight * 0.35,
                2.5,
                0,
                Math.PI * 2
            );
            context!.fill();

            context!.globalAlpha = 0.38;
            context!.fillStyle = "#e6e0ff";
            context!.font = "700 9px Inter, sans-serif";
            context!.textAlign = "center";
            context!.fillText(
                "LAST ME",
                ghostX + ghostWidth / 2,
                point.y - 8
            );
            context!.restore();
        }

        function drawPlayer() {
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

            const playerGradient =
                context!.createLinearGradient(
                    playerX,
                    displayedY,
                    playerX +
                    displayedWidth,
                    displayedY +
                    displayedHeight
                );

            const playerPalette = scoreRef.current >= 300
                ? ["#fff09b", "#ff9d3d", "#e34b68"]
                : scoreRef.current >= 150
                    ? ["#b7ffdc", "#36d6a0", "#168b83"]
                    : ["#bca7ff", "#8062ff", "#4d38c8"];

            playerGradient.addColorStop(
                0,
                playerPalette[0]
            );

            playerGradient.addColorStop(
                0.5,
                playerPalette[1]
            );

            playerGradient.addColorStop(
                1,
                playerPalette[2]
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

            const elapsed = animationTime - runStartedAtRef.current;
            const lastGhostPoint =
                ghostRecordingRef.current[ghostRecordingRef.current.length - 1];
            if (
                ghostRecordingRef.current.length < 2400 &&
                (lastGhostPoint === undefined || elapsed - lastGhostPoint.time >= 40)
            ) {
                ghostRecordingRef.current.push({
                    time: elapsed,
                    x: player.x,
                    y: player.y
                });
            }

            for (const platform of platformsRef.current) {
                if (platform.type === "moving" && !platform.broken) {
                    const previousX = platform.x;
                    platform.x =
                        platform.originX +
                        Math.sin(animationTime / 900 + platform.phase) * 38;
                    if (
                        player.grounded &&
                        platform.id === currentPlatformRef.current
                    ) {
                        player.x += platform.x - previousX;
                    }
                }
                if (
                    platform.type === "temporary" &&
                    platform.landedAt !== undefined &&
                    animationTime - platform.landedAt > 1500
                ) {
                    platform.broken = true;
                    if (
                        player.grounded &&
                        platform.id === currentPlatformRef.current
                    ) {
                        player.grounded = false;
                        player.velocityY = 40;
                    }
                }
            }

            if (
                chargingRef.current &&
                player.grounded &&
                !manualChargingRef.current
            ) {
                const elapsed =
                    animationTime -
                    chargeStartedAtRef.current;

                if (elapsed >= MAX_CHARGE_TIME + MAX_POWER_HOLD_TIME) {
                    chargingRef.current = false;
                    chargeExpiredRef.current = true;
                    chargeRef.current = 0;
                    setCharge(0);
                } else {
                    const nextCharge = Math.min(1, elapsed / MAX_CHARGE_TIME);
                    chargeRef.current = nextCharge;
                    setCharge(nextCharge);
                }
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

                for (const star of collectiblesRef.current) {
                    if (
                        !star.collected &&
                        Math.abs(player.x + player.width / 2 - star.x) < 24 &&
                        Math.abs(player.y + player.height / 2 - star.y) < 28
                    ) {
                        star.collected = true;
                        scoreRef.current += 5;
                        statsRef.current = {
                            ...statsRef.current,
                            stars: statsRef.current.stars + 1
                        };
                        setScore(scoreRef.current);
                        setStats(statsRef.current);
                        bonusTextRef.current = "STAR +5";
                        bonusUntilRef.current = animationTime + 850;
                    }
                }

                const currentBottom =
                    player.y +
                    player.height;

                if (player.velocityY >= 0) {
                    for (
                        const platform of
                        platformsRef.current
                    ) {
                        if (platform.broken) continue;
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
                            horizontalOverlap >=
                            player.width / 3;

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
                        doubleJumpAvailableRef.current = false;

                        if (platform.type === "temporary") {
                            platform.landedAt = animationTime;
                        }

                        if (
                            platform.id >
                            currentPlatformRef.current
                        ) {
                            const platformDistance =
                                platform.id -
                                currentPlatformRef.current;

                            const skippedPlatforms =
                                platformDistance - 1;

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

                            const good =
                                !perfect &&
                                centreDistance <= platform.width * 0.28;

                            const distanceMultiplier =
                                2 ** skippedPlatforms;

                            const centreMultiplier =
                                perfect ? 3 : 1;

                            const baseScore =
                                distanceMultiplier *
                                centreMultiplier;

                            const previousCentreStreak =
                                centreStreakRef.current;

                            centreStreakRef.current = perfect
                                ? centreStreakRef.current + 1
                                : 0;
                            setCentreStreak(centreStreakRef.current);

                            const centreComboMultiplier = perfect
                                ? 2 ** (centreStreakRef.current - 1)
                                : 1;

                            const addedScore =
                                baseScore *
                                centreComboMultiplier;

                            const previousScore = scoreRef.current;
                            scoreRef.current += addedScore;

                            const crossedMilestone =
                                Math.floor(scoreRef.current / 100) >
                                Math.floor(previousScore / 100);
                            if (crossedMilestone) {
                                scoreRef.current += 25;
                            }

                            statsRef.current = {
                                ...statsRef.current,
                                centres:
                                    statsRef.current.centres +
                                    (perfect ? 1 : 0),
                                longestJump: Math.max(
                                    statsRef.current.longestJump,
                                    platformDistance
                                ),
                                bestStreak: Math.max(
                                    statsRef.current.bestStreak,
                                    centreStreakRef.current
                                )
                            };
                            setStats(statsRef.current);

                            const unlocked = [
                                scoreRef.current >= 100 ? "百点高手" : "",
                                statsRef.current.bestStreak >= 5 ? "中心大师" : "",
                                statsRef.current.longestJump >= 4 ? "飞跃专家" : "",
                                statsRef.current.stars >= 10 ? "星星猎人" : ""
                            ].filter(Boolean);
                            setAchievements(unlocked);

                            setScore(
                                scoreRef.current
                            );

                            bonusTextRef.current =
                                crossedMilestone
                                    ? `MILESTONE +25 · +${addedScore}`
                                    : perfect
                                    ? centreStreakRef.current > 1
                                        ? `CENTER COMBO x${centreComboMultiplier} +${addedScore}`
                                        : `CENTER +${addedScore}`
                                    : previousCentreStreak > 0
                                        ? `COMBO LOST · ${good ? "GOOD" : "EDGE"} +${addedScore}`
                                        : good
                                            ? `GOOD +${addedScore}`
                                    : skippedPlatforms > 0
                                        ? `SKIP +${addedScore}`
                                        : `EDGE +${addedScore}`;

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
                        } else {
                            centreStreakRef.current = 0;
                            setCentreStreak(0);
                        }

                        if (
                            platform.type !== "bounce" &&
                            !chargingRef.current &&
                            (keyboardChargeHeldRef.current ||
                                stageChargeHeldRef.current)
                        ) {
                            chargingRef.current = true;
                            chargeSourceRef.current =
                                keyboardChargeHeldRef.current
                                    ? "keyboard"
                                    : "stage";
                            chargeStartedAtRef.current = animationTime;
                            chargeRef.current = 0;
                            setCharge(0);
                        }

                        if (platform.type === "bounce") {
                            player.grounded = false;
                            player.velocityY = -520;
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
            drawCollectibles();
            drawGhost(animationTime);
            drawPlayer();
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
                            Drag the power bar and release
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
                    if (event.pointerType === "mouse" && event.button !== 0) return;
                    stageChargeHeldRef.current = true;
                    if (gameStateRef.current !== "playing" || !playerRef.current.grounded) return;
                    event.preventDefault();
                    beginCharge("stage");
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
                            onPointerDown={(event) => event.stopPropagation()}
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

                            <p className="jump-game-summary">
                                {stats.jumps} jumps · {stats.centres} centres · best combo {stats.bestStreak}
                            </p>

                            <button
                                type="button"
                                onPointerDown={(event) => event.stopPropagation()}
                                onClick={resetGame}
                            >
                                Play Again
                            </button>
                        </div>
                    )}

                {gameState === "paused" && (
                    <div className="jump-game-overlay">
                        <span className="jump-game-overlay-label">Paused</span>
                        <h4>Take a break</h4>
                        <button
                            type="button"
                            aria-label={gameState === "paused" ? "Resume game" : "Pause game"}
                            title={gameState === "paused" ? "Resume game" : "Pause game"}
                            onPointerDown={(event) => event.stopPropagation()}
                            onClick={togglePause}
                        >
                            Resume
                        </button>
                    </div>
                )}

                {(gameState === "playing" || gameState === "paused") && (
                    <div className="jump-game-live-hud">
                        <span>Combo <strong>{centreStreak}</strong></span>
                        <span>Next <strong>x{2 ** centreStreak}</strong></span>
                        <span>Stars <strong>{stats.stars}</strong></span>
                        <button
                            type="button"
                            aria-label={gameState === "paused" ? "Resume game" : "Pause game"}
                            title={gameState === "paused" ? "Resume game" : "Pause game"}
                            onPointerDown={(event) => event.stopPropagation()}
                            onClick={togglePause}
                        >
                            {gameState === "paused" ? "▶" : "Ⅱ"}
                        </button>
                        <button
                            type="button"
                            aria-label="Restart game"
                            title="Restart game"
                            onPointerDown={(event) => event.stopPropagation()}
                            onClick={resetGame}
                        >
                            ↻
                        </button>
                    </div>
                )}

                {gameState ===
                    "playing" && (
                        <div className="charge-container">
                            <div className="charge-label">
                                <span>Hold stage / Space · release</span>
                                <strong>{chargePercent}%</strong>
                            </div>
                            <div
                                className="charge-track interactive"
                                role="slider"
                                aria-label="Jump power"
                                aria-valuemin={0}
                                aria-valuemax={100}
                                aria-valuenow={chargePercent}
                                tabIndex={0}
                                onPointerDown={(event) => {
                                    if ((event.pointerType === "mouse" && event.button !== 0) || gameStateRef.current !== "playing" || !playerRef.current.grounded) return;
                                    event.preventDefault();
                                    event.stopPropagation();
                                    event.currentTarget.setPointerCapture(event.pointerId);
                                    const bounds = event.currentTarget.getBoundingClientRect();
                                    const nextCharge = Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width));
                                    chargeExpiredRef.current = false;
                                    manualChargingRef.current = true;
                                    chargingRef.current = true;
                                    chargeSourceRef.current = "slider";
                                    chargeRef.current = nextCharge;
                                    setCharge(nextCharge);
                                }}
                                onPointerMove={(event) => {
                                    if (!manualChargingRef.current || !event.currentTarget.hasPointerCapture(event.pointerId)) return;
                                    event.preventDefault();
                                    const bounds = event.currentTarget.getBoundingClientRect();
                                    const nextCharge = Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width));
                                    chargeRef.current = nextCharge;
                                    setCharge(nextCharge);
                                }}
                                onPointerUp={(event) => {
                                    if (!manualChargingRef.current) return;
                                    event.preventDefault();
                                    event.stopPropagation();
                                    const bounds = event.currentTarget.getBoundingClientRect();
                                    const finalCharge = Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width));
                                    chargeRef.current = finalCharge;
                                    setCharge(finalCharge);
                                    releaseCharge("slider");
                                }}
                                onPointerCancel={() => {
                                    manualChargingRef.current = false;
                                    chargingRef.current = false;
                                    chargeSourceRef.current = null;
                                    chargeRef.current = 0;
                                    setCharge(0);
                                }}
                            >
                                <div className="charge-fill" style={{ width: `${chargeBarPercent}%` }}><i className="charge-handle" /></div>
                            </div>
                        </div>
                    )}
            </div>

            <div className="jump-game-instructions">
                <span>
                    🖱️ Hold stage or drag power
                </span>

                <span>
                    ⌨️ Hold Space to charge
                </span>

                <span>
                    🎯 Consecutive centres double
                </span>
            </div>

            <div className="jump-game-stats">
                <span>Jumps <strong>{stats.jumps}</strong></span>
                <span>Centre rate <strong>{stats.jumps > 0 ? Math.round(stats.centres / stats.jumps * 100) : 0}%</strong></span>
                <span>Longest <strong>{stats.longestJump}</strong></span>
                <span>Best combo <strong>{stats.bestStreak}</strong></span>
            </div>

            {achievements.length > 0 && (
                <div className="jump-game-achievements">
                    {achievements.map((achievement) => (
                        <span key={achievement}>🏆 {achievement}</span>
                    ))}
                </div>
            )}
        </article>
    );
}

export default JumpGame;
