'use client';

import { useEffect, useRef } from 'react';
import type { StudyPeriod, StudyWeather } from '../lib/study-atmosphere';

const WIDTH = 1672;
const HEIGHT = 941;
// Each pane stops at the actual desk / monitor silhouette, and excludes the mullions.
const GLASS = 'M274 0H476L438 313L246 292Z M509 0H798L728 378L463 326Z M831 0H1398L1274 514L942 427L758 391Z M1431 0H1672V560L1625 643L1335 523Z';
type Light = { shape: Path2D; phase: number; cycle: number };
type Particle = { x: number; y: number; depth: number; phase: number };

function noise(seed: number) {
  const value = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
  return value - Math.floor(value);
}
const particles: Particle[] = Array.from({ length: 640 }, (_, i) => ({ x: noise(i + 1) * WIDTH, y: noise(i + 780) * HEIGHT, depth: noise(i + 1610), phase: noise(i + 2380) * Math.PI * 2 }));
const wrap = (value: number, size: number) => ((value % size) + size) % size;
const smooth = (value: number) => { const t = Math.max(0, Math.min(1, value)); return t * t * (3 - 2 * t); };

// Find the windows already drawn in the night plate. Animate their exact pixels,
// never attach invented rectangles to unrelated positions in the illustration.
function findWindows(plate: HTMLImageElement, glass: Path2D): Light[] {
  const sample = document.createElement('canvas');
  sample.width = WIDTH / 2;
  sample.height = Math.ceil(HEIGHT / 2);
  const ctx = sample.getContext('2d', { willReadFrequently: true });
  if (!ctx) return [];
  ctx.drawImage(plate, 0, 0, sample.width, sample.height);
  const { data } = ctx.getImageData(0, 0, sample.width, sample.height);
  const visited = new Uint8Array(sample.width * sample.height);
  const bright = (p: number) => data[p * 4] > 145 && data[p * 4 + 1] > 125 && data[p * 4 + 2] < 125;
  const lights: Light[] = [];
  for (let y = 30; y < 310; y++) for (let x = 125; x < sample.width; x++) {
    const start = y * sample.width + x;
    if (visited[start] || !bright(start) || !ctx.isPointInPath(glass, x * 2, y * 2)) continue;
    const queue = [start];
    visited[start] = 1;
    let left = x, right = x, top = y, bottom = y;
    for (let index = 0; index < queue.length; index++) {
      const p = queue[index], px = p % sample.width, py = Math.floor(p / sample.width);
      left = Math.min(left, px); right = Math.max(right, px); top = Math.min(top, py); bottom = Math.max(bottom, py);
      for (const n of [p - 1, p + 1, p - sample.width, p + sample.width]) {
        if (n < 0 || n >= visited.length || visited[n] || !bright(n)) continue;
        visited[n] = 1;
        queue.push(n);
      }
    }
    if (queue.length < 4 || queue.length > 240 || right - left > 24 || bottom - top > 36) continue;
    const shape = new Path2D();
    for (const p of queue) shape.rect((p % sample.width) * 2, Math.floor(p / sample.width) * 2, 2, 2);
    lights.push({ shape, phase: noise(start) * 60, cycle: 24 + noise(start + 7) * 48 });
  }
  return lights.slice(0, 360);
}

function makeClouds() {
  const cloud = document.createElement('canvas');
  cloud.width = 1024; cloud.height = 300;
  const ctx = cloud.getContext('2d')!;
  for (let i = 0; i < 80; i++) {
    const x = noise(i + 3) * 1024, y = noise(i + 93) * 300, radius = 45 + noise(i + 193) * 125;
    const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius);
    gradient.addColorStop(0, 'rgba(145,147,141,.12)');
    gradient.addColorStop(.55, 'rgba(145,147,141,.055)');
    gradient.addColorStop(1, 'rgba(145,147,141,0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
  }
  return cloud;
}

export function StudyAtmosphere({ period, weather, running }: { period: StudyPeriod; weather: StudyWeather; running: boolean }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const lights = useRef<Light[]>([]);
  const clock = useRef(0);
  useEffect(() => {
    let active = true;
    const plate = new Image();
    plate.onload = () => {
      if (!active) return;
      lights.current = findWindows(plate, new Path2D(GLASS));
      if (canvas.current) canvas.current.dataset.windows = String(lights.current.length);
    };
    plate.src = '/lockin/penthouse-night-v8.png';
    return () => { active = false; };
  }, []);
  useEffect(() => {
    const surface = canvas.current;
    const ctx = surface?.getContext('2d');
    if (!surface || !ctx) return;
    const glass = new Path2D(GLASS);
    const clouds = makeClouds();
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
    let frame = 0, previous = 0, lastPaint = -100;
    const rain = weather === 'drizzle' || weather === 'storm';
    const snow = weather === 'snow' || weather === 'blizzard';
    const heavy = weather === 'storm' || weather === 'blizzard';
    const night = period === 'night';
    function paint(time: number) {
      if (!ctx) return;
      ctx.clearRect(0, 0, WIDTH, HEIGHT);
      ctx.save();
      ctx.clip(glass);
      if (night) {
        ctx.fillStyle = '#11120f';
        for (const light of lights.current) {
          const phase = wrap(time + light.phase, light.cycle);
          ctx.globalAlpha = .9 * smooth((phase - 2) / 1.8) * (1 - smooth((phase - 9) / 2.4));
          ctx.fill(light.shape);
        }
        ctx.globalAlpha = 1;
        if (weather === 'clear' || weather === 'cloudy') {
          for (let i = 0; i < 100; i++) {
            const x = 500 + noise(i + 351) * 1150;
            const y = 6 + noise(i + 651) * (34 + (x - 500) * .17);
            const pulse = (.5 + .5 * Math.sin(time * (.65 + noise(i)) + i * 2.4)) ** 3;
            const radius = .55 + noise(i + 951) * 1.1;
            ctx.globalAlpha = (.28 + pulse * .65) * (weather === 'cloudy' ? .45 : 1);
            ctx.fillStyle = '#fffdf2';
            ctx.beginPath(); ctx.arc(x, y, radius, 0, Math.PI * 2); ctx.fill();
            if (i % 19 === 0) {
              ctx.globalAlpha *= pulse * .5;
              ctx.fillRect(x - 3.5, y - .35, 7, .7); ctx.fillRect(x - .35, y - 3.5, .7, 7);
            }
          }
          ctx.globalAlpha = 1;
        }
      }
      if (weather !== 'clear') {
        ctx.globalAlpha = weather === 'cloudy' ? .23 : heavy ? .7 : .48;
        const cloudX = wrap(time * 5, 1024);
        for (let i = -1; i < 3; i++) ctx.drawImage(clouds, i * 1024 + cloudX, -80 + i * 35, 1150, 430);
        const haze = ctx.createLinearGradient(0, 0, 0, 650);
        haze.addColorStop(0, night ? 'rgba(32,35,33,.25)' : 'rgba(107,115,112,.22)');
        haze.addColorStop(.65, night ? 'rgba(174,179,168,.14)' : 'rgba(235,237,227,.35)');
        haze.addColorStop(1, 'rgba(190,197,187,0)');
        ctx.globalAlpha = heavy ? 1 : weather === 'cloudy' ? .25 : .65;
        ctx.fillStyle = haze; ctx.fillRect(0, 0, WIDTH, 700); ctx.globalAlpha = 1;
      }
      if (rain) {
        // Uneven spacing, three depth ranges, wind gusts and different terminal speeds.
        const count = heavy ? 600 : 180;
        const gust = Math.sin(time * .32) * (heavy ? 65 : 12);
        for (let i = 0; i < count; i++) {
          const p = particles[i], speed = (heavy ? 480 : 230) + p.depth * (heavy ? 900 : 600);
          const y = wrap(p.y + time * speed, 780) - 40;
          const x = wrap(p.x + time * speed * (heavy ? -.22 : -.09) + gust * p.depth, WIDTH + 200) - 100;
          const length = (heavy ? 13 : 6) + p.depth * (heavy ? 30 : 17);
          ctx.strokeStyle = night ? `rgba(241,245,232,${.09 + p.depth * .3})` : `rgba(103,115,112,${.12 + p.depth * .25})`;
          ctx.lineWidth = .4 + p.depth * .85;
          ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - length * (heavy ? .22 : .09), y + length); ctx.stroke();
        }
        // Water on the near glass: beads hold, merge into slow runs, then leave a fine trail.
        for (let i = 0; i < (heavy ? 95 : 26); i++) {
          const p = particles[620 - i], phase = wrap(time + p.phase * 4, 18);
          const slide = Math.max(0, phase - 9) ** 2 * 2.8;
          const x = p.x, y = wrap(p.y * .7 + slide, 620), r = .9 + p.depth * 2;
          ctx.lineWidth = .65; ctx.strokeStyle = night ? 'rgba(248,251,239,.32)' : 'rgba(96,110,106,.3)';
          ctx.beginPath(); ctx.ellipse(x, y, r * .65, r * 1.3, -.1, 0, Math.PI * 2); ctx.stroke();
          ctx.strokeStyle = 'rgba(248,251,239,.2)';
          ctx.beginPath(); ctx.moveTo(x + .6, y - r); ctx.lineTo(x + .6, y - r - Math.min(slide * .4, 45)); ctx.stroke();
        }
      }
      if (snow) {
        for (let i = 0; i < (heavy ? 460 : 170); i++) {
          const p = particles[i], speed = 14 + p.depth * (heavy ? 95 : 46);
          const y = wrap(p.y + time * speed, 780) - 30;
          const x = wrap(p.x + time * (heavy ? -48 - p.depth * 100 : 8 + p.depth * 16) + Math.sin(time * (.5 + p.depth) + p.phase) * (8 + p.depth * 23), WIDTH + 100) - 50;
          const r = .45 + p.depth ** 3 * (heavy ? 4 : 3);
          ctx.globalAlpha = .18 + p.depth * .65;
          ctx.fillStyle = '#fffdf2';
          ctx.beginPath(); ctx.ellipse(x, y, r, r * (1 + Math.sin(p.phase + time) * .2), 0, 0, Math.PI * 2); ctx.fill();
        }
        ctx.globalAlpha = 1;
      }
      ctx.restore();
    }
    function animate(stamp: number) {
      if (previous) clock.current += Math.min(.1, (stamp - previous) / 1000);
      previous = stamp;
      if (stamp - lastPaint >= 1000 / 30) { paint(clock.current); lastPaint = stamp; }
      frame = requestAnimationFrame(animate);
    }
    function start() {
      cancelAnimationFrame(frame); previous = 0;
      paint(clock.current);
      if (running && !reduced.matches) frame = requestAnimationFrame(animate);
    }
    start();
    reduced.addEventListener('change', start);
    return () => { cancelAnimationFrame(frame); reduced.removeEventListener('change', start); };
  }, [period, weather, running]);
  return <canvas ref={canvas} className="study-atmosphere" width={WIDTH} height={HEIGHT} aria-hidden="true" />;
}
