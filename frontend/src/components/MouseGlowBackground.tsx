import { useEffect, useRef } from "react";
import "./MouseGlowBackground.css";

interface Particle {
    x: number;
    y: number;
    size: number;
    speedX: number;
    speedY: number;
    color: string;
    alpha: number;
}

function MouseGlowBackground() {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const backgroundRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const canvas = canvasRef.current;
        const background = backgroundRef.current;

        if (!canvas || !background) {
            return;
        }

        const context = canvas.getContext("2d");

        if (!context) {
            return;
        }

        const mouse = {
            x: window.innerWidth / 2,
            y: window.innerHeight / 2
        };

        let particles: Particle[] = [];
        let animationId = 0;

        const colors = [
            "#00ffd5",
            "#00bfff",
            "#8b5cff",
            "#ff00d4",
            "#ffffff"
        ];

        function resizeCanvas() {
            if (!canvas) {
                return;
            }

            canvas.width = window.innerWidth;
            canvas.height = window.innerHeight;

            createParticles();
        }

        function createParticles() {
            if (!canvas) {
                return;
            }

            const particleAmount = Math.min(
                160,
                Math.floor((canvas.width * canvas.height) / 9000)
            );

            particles = Array.from(
                { length: particleAmount },
                () => ({
                    x: Math.random() * canvas.width,
                    y: Math.random() * canvas.height,
                    size: Math.random() * 2.5 + 0.5,
                    speedX: (Math.random() - 0.5) * 0.35,
                    speedY: (Math.random() - 0.5) * 0.35,
                    color:
                        colors[
                        Math.floor(Math.random() * colors.length)
                        ],
                    alpha: Math.random() * 0.45 + 0.15
                })
            );
        }

        function updateMouse(event: PointerEvent) {
            mouse.x = event.clientX;
            mouse.y = event.clientY;

            background?.style.setProperty(
                "--mouse-x",
                `${event.clientX}px`
            );

            background?.style.setProperty(
                "--mouse-y",
                `${event.clientY}px`
            );
        }

        function animate() {
            if (!canvas || !context) {
                return;
            }

            context.clearRect(
                0,
                0,
                canvas.width,
                canvas.height
            );

            particles.forEach((particle) => {
                particle.x += particle.speedX;
                particle.y += particle.speedY;

                if (particle.x < 0) {
                    particle.x = canvas.width;
                }

                if (particle.x > canvas.width) {
                    particle.x = 0;
                }

                if (particle.y < 0) {
                    particle.y = canvas.height;
                }

                if (particle.y > canvas.height) {
                    particle.y = 0;
                }

                const distanceX = mouse.x - particle.x;
                const distanceY = mouse.y - particle.y;

                const distance = Math.sqrt(
                    distanceX * distanceX +
                    distanceY * distanceY
                );

                const lightRadius = 260;
                const isNearMouse = distance < lightRadius;

                const lightStrength = isNearMouse
                    ? 1 - distance / lightRadius
                    : 0;

                const finalSize =
                    particle.size + lightStrength * 4;

                const finalAlpha =
                    particle.alpha + lightStrength * 0.85;

                context.beginPath();

                context.arc(
                    particle.x,
                    particle.y,
                    finalSize,
                    0,
                    Math.PI * 2
                );

                context.fillStyle = particle.color;
                context.globalAlpha = Math.min(finalAlpha, 1);

                if (isNearMouse) {
                    context.shadowBlur =
                        8 + lightStrength * 25;

                    context.shadowColor = particle.color;
                } else {
                    context.shadowBlur = 0;
                }

                context.fill();
            });

            context.globalAlpha = 1;
            context.shadowBlur = 0;

            animationId = requestAnimationFrame(animate);
        }

        resizeCanvas();
        animate();

        window.addEventListener("resize", resizeCanvas);
        window.addEventListener("pointermove", updateMouse);

        return () => {
            cancelAnimationFrame(animationId);

            window.removeEventListener(
                "resize",
                resizeCanvas
            );

            window.removeEventListener(
                "pointermove",
                updateMouse
            );
        };
    }, []);

    return (
        <div
            ref={backgroundRef}
            className="mouse-glow-background"
        >
            <canvas ref={canvasRef} />

            <div className="mouse-light" />
            <div className="background-vignette" />
        </div>
    );
}

export default MouseGlowBackground;