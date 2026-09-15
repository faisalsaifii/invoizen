"use client";

import { useTheme } from "next-themes";
import { useEffect, useRef } from "react";

type Particle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
};

type Palette = {
  rgb: string;
  lineAlpha: number;
  cursorAlpha: number;
  glowAlpha: number;
};

function themePalette(theme: string | undefined): Palette {
  const light = theme !== "dark";
  return {
    rgb: light ? "0,0,0" : "255,255,255",
    lineAlpha: light ? 0.05 : 0.06,
    cursorAlpha: light ? 0.14 : 0.18,
    glowAlpha: light ? 0.05 : 0.05,
  };
}

function createParticles(width: number, height: number, count: number) {
  const particles: Particle[] = [];
  for (let i = 0; i < count; i++) {
    particles.push({
      x: Math.random() * width,
      y: Math.random() * height,
      vx: (Math.random() - 0.5) * 0.4,
      vy: (Math.random() - 0.5) * 0.4,
      radius: Math.random() * 1.5 + 0.7,
    });
  }
  return particles;
}

export function AnimatedBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const glowRef = useRef<HTMLDivElement>(null);
  const cursor = useRef({ x: -9999, y: -9999 });
  const lerpedCursor = useRef({ x: -9999, y: -9999 });
  const { resolvedTheme } = useTheme();

  useEffect(() => {
    const canvas = canvasRef.current;
    const glow = glowRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const c = ctx;

    const reduced = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    let width = 0;
    let height = 0;
    let particles: Particle[] = [];
    let raf = 0;
    let running = true;

    const palette = themePalette(resolvedTheme);

    const resize = () => {
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      c.setTransform(dpr, 0, 0, dpr, 0, 0);
      const count = Math.min(110, Math.floor((width * height) / 14000));
      particles = createParticles(width, height, count);
    };
    resize();

    const onScroll = () => {
      cursor.current.x = -9999;
      cursor.current.y = -9999;
      lerpedCursor.current.x = -9999;
      lerpedCursor.current.y = -9999;
      if (glow) glow.style.opacity = "0";
    };

    const onMove = (e: PointerEvent) => {
      if (glow) glow.style.opacity = "1";
      cursor.current.x = e.clientX;
      cursor.current.y = e.clientY;
    };

    window.addEventListener("resize", resize);
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("pointermove", onMove, { passive: true });

    const linkDistance = 130;
    const influence = 140;

    function draw() {
      c.clearRect(0, 0, width, height);
      const cx = lerpedCursor.current.x;
      const cy = lerpedCursor.current.y;

      for (const p of particles) {
        p.x += p.vx;
        p.y += p.vy;

        if (p.x < -20) p.x = width + 20;
        if (p.x > width + 20) p.x = -20;
        if (p.y < -20) p.y = height + 20;
        if (p.y > height + 20) p.y = -20;

        const dx = p.x - cx;
        const dy = p.y - cy;
        const dist = Math.hypot(dx, dy);
        if (dist < influence && dist > 0.001) {
          const force = ((influence - dist) / influence) * 0.6;
          p.x += (dx / dist) * force;
          p.y += (dy / dist) * force;
        }

        c.beginPath();
        c.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
        c.fillStyle = `rgba(${palette.rgb},0.45)`;
        c.fill();
      }

      for (let i = 0; i < particles.length; i++) {
        for (let j = i + 1; j < particles.length; j++) {
          const a = particles[i];
          const b = particles[j];
          const dist = Math.hypot(a.x - b.x, a.y - b.y);
          if (dist < linkDistance) {
            c.beginPath();
            c.moveTo(a.x, a.y);
            c.lineTo(b.x, b.y);
            c.strokeStyle = `rgba(${palette.rgb},${palette.lineAlpha})`;
            c.globalAlpha = 1 - dist / linkDistance;
            c.lineWidth = 1;
            c.stroke();
          }
        }
      }

      if (cx > -9900 && cy > -9900) {
        for (const p of particles) {
          const dist = Math.hypot(p.x - cx, p.y - cy);
          if (dist < influence) {
            c.beginPath();
            c.moveTo(p.x, p.y);
            c.lineTo(cx, cy);
            c.strokeStyle = `rgba(${palette.rgb},${palette.cursorAlpha})`;
            c.globalAlpha = 1 - dist / influence;
            c.lineWidth = 1;
            c.stroke();
          }
        }

        const g = c.createRadialGradient(cx, cy, 0, cx, cy, 220);
        g.addColorStop(0, `rgba(${palette.rgb},${palette.glowAlpha})`);
        g.addColorStop(1, "rgba(0,0,0,0)");
        c.beginPath();
        c.fillStyle = g;
        c.fillRect(cx - 220, cy - 220, 440, 440);
      }

      c.globalAlpha = 1;

      lerpedCursor.current.x += (cursor.current.x - lerpedCursor.current.x) * 0.08;
      lerpedCursor.current.y += (cursor.current.y - lerpedCursor.current.y) * 0.08;

      if (cx > -9900 && cy > -9900 && glow) {
        glow.style.transform = `translate(${cx}px, ${cy}px)`;
      }
    }

    let loop = () => {};
    if (reduced) {
      draw();
    } else {
      loop = () => {
        if (!running) return;
        draw();
        raf = requestAnimationFrame(loop);
      };
      raf = requestAnimationFrame(loop);
    }

    const onVisibility = () => {
      running = !document.hidden;
      if (running && !reduced) {
        cancelAnimationFrame(raf);
        raf = requestAnimationFrame(loop);
      }
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      running = false;
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("pointermove", onMove);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [resolvedTheme]);

  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-0 z-0 overflow-hidden"
    >
      <div className="absolute inset-0 [background-image:radial-gradient(hsl(var(--foreground)/0.1)_1px,transparent_1px)] [background-size:28px_28px] [mask-image:radial-gradient(ellipse_90%_70%_at_50%_0%,black,transparent_80%)]" />
      <div className="absolute inset-x-0 top-0 h-[42rem] bg-[radial-gradient(ellipse_at_top,hsl(var(--foreground)/0.05),transparent_65%)]" />
      <div className="absolute inset-x-0 bottom-0 h-96 bg-[radial-gradient(ellipse_at_bottom,hsl(var(--foreground)/0.04),transparent_70%)]" />

      <div className="absolute -top-32 left-[8%] h-[34rem] w-[34rem] rounded-full bg-[radial-gradient(circle_at_center,hsl(var(--foreground)/0.08),transparent_70%)] blur-3xl opacity-70 [animation:blob-float_26s_ease-in-out_infinite]" />
      <div className="absolute top-1/3 right-[4%] h-[26rem] w-[26rem] rounded-full bg-[radial-gradient(circle_at_center,hsl(var(--foreground)/0.06),transparent_70%)] blur-3xl opacity-60 [animation:blob-float_20s_ease-in-out_infinite_-4s]" />
      <div className="absolute -bottom-24 left-[30%] h-[30rem] w-[30rem] rounded-full bg-[radial-gradient(circle_at_center,hsl(var(--foreground)/0.05),transparent_70%)] blur-3xl opacity-60 [animation:blob-float_32s_ease-in-out_infinite_-10s]" />

      <div
        ref={glowRef}
        className="absolute left-0 top-0 -ml-64 -mt-64 h-[32rem] w-[32rem] rounded-full bg-[radial-gradient(circle,hsl(var(--foreground)/0.06),transparent_65%)] opacity-0 will-change-transform transition-opacity duration-300"
      />
      <canvas ref={canvasRef} className="absolute inset-0" />
    </div>
  );
}