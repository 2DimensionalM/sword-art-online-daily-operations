'use client';

import { useEffect, useId, useRef, useState, type MouseEvent } from 'react';
import type { SleepRecord } from '../lib/sleep-store';

type SleepCompactBandProps = {
  records: SleepRecord[];
  averageSleep: number | null;
  averageWake: number | null;
};

type BandPoint = {
  record: SleepRecord;
  x: number;
  sleep: number;
  wake: number;
  date: Date;
  earlySleep: boolean;
  lateWake: boolean;
};

const LEFT = 50;
const RIGHT = 30;
const TOP = 26;
const BOTTOM = 18;
const CHART_HEIGHT = 476;
const STEP = 24;

function clockMinutes(date: Date) {
  return date.getHours() * 60 + date.getMinutes();
}

function axisLabel(minutes: number) {
  return `${String(Math.floor(minutes / 60) % 24).padStart(2, '0')}:00`;
}

function timeLabel(date: Date) {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

export function SleepCompactBand({ records, averageSleep, averageWake }: SleepCompactBandProps) {
  const bandClipId = useId();
  const scrollRef = useRef<HTMLDivElement>(null);
  const atLatestRef = useRef(true);
  const [hovered, setHovered] = useState<{ point: BandPoint; x: number; y: number } | null>(null);
  const points: BandPoint[] = [...records].reverse().map((record, index) => {
    const sleepDate = new Date(record.sleepStartedAt);
    const wakeDate = new Date(record.wakeAt);
    const wake = 1440 + clockMinutes(wakeDate);
    const sleep = wake - (wakeDate.getTime() - sleepDate.getTime()) / 60_000;
    const sleepMean = averageSleep === null ? null : averageSleep + (averageSleep < 720 ? 1440 : 0);
    const wakeMean = averageWake === null ? null : averageWake + 1440;
    return {
      record,
      x: LEFT + index * STEP,
      sleep,
      wake,
      date: wakeDate,
      earlySleep: sleepMean !== null && sleep < sleepMean,
      lateWake: wakeMean !== null && wake > wakeMean,
    };
  });
  const minMinute = Math.floor(Math.min(1080, ...points.map((point) => point.sleep)) / 180) * 180;
  const maxMinute = Math.ceil(Math.max(2520, ...points.map((point) => point.wake)) / 180) * 180;
  const plotHeight = CHART_HEIGHT - TOP - BOTTOM;
  const y = (minutes: number) => TOP + (minutes - minMinute) / (maxMinute - minMinute) * plotHeight;
  const width = Math.max(720, LEFT + (points.length - 1) * STEP + RIGHT);
  const ticks = Array.from({ length: (maxMinute - minMinute) / 180 + 1 }, (_, index) => minMinute + index * 180);
  const sleepLine = points.map((point) => `${point.x},${y(point.sleep)}`).join(' ');
  const wakeLine = points.map((point) => `${point.x},${y(point.wake)}`).join(' ');
  const band = [...points.map((point) => `${point.x},${y(point.sleep)}`), ...[...points].reverse().map((point) => `${point.x},${y(point.wake)}`)].join(' ');
  const meanSleep = averageSleep === null ? null : averageSleep + (averageSleep < 720 ? 1440 : 0);
  const meanWake = averageWake === null ? null : averageWake + 1440;

  useEffect(() => {
    const scroll = scrollRef.current;
    if (!scroll) return;
    scroll.scrollLeft = scroll.scrollWidth;
    atLatestRef.current = true;
    const observer = new ResizeObserver(() => {
      if (atLatestRef.current) scroll.scrollLeft = scroll.scrollWidth;
    });
    observer.observe(scroll);
    return () => observer.disconnect();
  }, [records]);

  function showTooltip(event: MouseEvent<HTMLDivElement>) {
    const scroll = event.currentTarget;
    const scrollBounds = scroll.getBoundingClientRect();
    const plotX = event.clientX - scrollBounds.left + scroll.scrollLeft;
    const index = Math.round((plotX - LEFT) / STEP);
    if (index < 0 || index >= points.length || Math.abs(plotX - points[index].x) > STEP / 2) {
      setHovered(null);
      return;
    }
    const panel = scroll.closest('.sleep-compact-panel')?.getBoundingClientRect();
    if (!panel) return;
    const pointX = points[index].x - scroll.scrollLeft + scrollBounds.left - panel.left;
    const tooltipX = pointX + 235 <= panel.width ? pointX + 120 : pointX - 120;
    setHovered({
      point: points[index],
      x: Math.max(115, Math.min(panel.width - 115, tooltipX)),
      y: Math.max(62, event.clientY - panel.top - 83),
    });
  }

  return <div className="sleep-compact-panel">
    <div className="sleep-compact-plot"><div ref={scrollRef} className="sleep-compact-scroll" tabIndex={0} role="region" aria-label="睡眠节律横向图表，可左右滚动查看全部记录" onMouseMove={showTooltip} onMouseLeave={() => setHovered(null)} onScroll={(event) => { setHovered(null); atLatestRef.current = event.currentTarget.scrollWidth - event.currentTarget.clientWidth - event.currentTarget.scrollLeft < STEP; }}>
      <svg width={width} height={CHART_HEIGHT} viewBox={`0 0 ${width} ${CHART_HEIGHT}`} preserveAspectRatio="none" role="img" aria-label={`从较早记录到最近一晚，${records.length} 晚的入睡和醒来时间带`}>
        <defs><clipPath id={bandClipId}><polygon points={band} /></clipPath></defs>
        <rect x="0" y="0" width={width} height={CHART_HEIGHT} className="sleep-compact-field" />
        {ticks.map((minute) => <line key={minute} x1="0" x2={width} y1={y(minute)} y2={y(minute)} className="sleep-compact-gridline" />)}
        {points.map((point) => <line key={point.record.id} x1={point.x} x2={point.x} y1={TOP} y2={CHART_HEIGHT - BOTTOM + 4} className="sleep-compact-column" />)}
        {hovered && <rect x={hovered.point.x - STEP / 2} y={TOP} width={STEP} height={plotHeight} className="sleep-compact-hover-column" />}
        {meanSleep !== null && <line x1="0" x2={width} y1={y(meanSleep)} y2={y(meanSleep)} className="sleep-compact-average sleep" />}
        {meanWake !== null && <line x1="0" x2={width} y1={y(meanWake)} y2={y(meanWake)} className="sleep-compact-average wake" />}
        <polygon points={band} className="sleep-compact-band" />
        {meanSleep !== null && <rect x="0" y="0" width={width} height={y(meanSleep)} clipPath={`url(#${bandClipId})`} className="sleep-compact-band-excess" />}
        {meanWake !== null && <rect x="0" y={y(meanWake)} width={width} height={CHART_HEIGHT - y(meanWake)} clipPath={`url(#${bandClipId})`} className="sleep-compact-band-excess" />}
        <polyline points={sleepLine} className="sleep-compact-line sleep" />
        <polyline points={wakeLine} className="sleep-compact-line wake" />
        {hovered && <g className="sleep-compact-hover-markers">
          <line x1={hovered.point.x} x2={hovered.point.x} y1={y(hovered.point.sleep)} y2={y(hovered.point.wake)} className="sleep-compact-hover-span" />
          <circle cx={hovered.point.x} cy={y(hovered.point.sleep)} r="10" className="sleep-compact-hover-ring" />
          <circle cx={hovered.point.x} cy={y(hovered.point.sleep)} r="5" className="sleep-compact-hover-point sleep" />
          <circle cx={hovered.point.x} cy={y(hovered.point.wake)} r="10" className="sleep-compact-hover-ring" />
          <circle cx={hovered.point.x} cy={y(hovered.point.wake)} r="5" className="sleep-compact-hover-point wake" />
        </g>}
      </svg>
    </div><div className="sleep-compact-y-axis" aria-hidden="true">{ticks.map((minute) => <span key={minute} style={{ top: `${y(minute) / CHART_HEIGHT * 100}%` }}>{axisLabel(minute)}</span>)}</div></div>
    {hovered && <div className="sleep-compact-tooltip" role="tooltip" style={{ left: hovered.x, top: hovered.y }}><strong>{new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'short' }).format(hovered.point.date)}</strong><span>入睡 {timeLabel(new Date(hovered.point.record.sleepStartedAt))} · 醒来 {timeLabel(hovered.point.date)}</span>{(hovered.point.earlySleep || hovered.point.lateWake) && <small>{[hovered.point.earlySleep && '早于平均入睡', hovered.point.lateWake && '晚于平均醒来'].filter(Boolean).join(' / ')}</small>}</div>}
    <div className="sleep-compact-footer"><span>← EARLIER</span><span>HOVER FOR DATE · SCROLL ↔</span><span>LATEST →</span></div>
  </div>;
}
