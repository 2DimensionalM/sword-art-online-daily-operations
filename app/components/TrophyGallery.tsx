'use client';

import { useEffect, useRef, useId, type CSSProperties } from 'react';
import type { Goal } from '../lib/signal-store';
import type { SignalTaskType, TrophyEntry } from './SignalRoom';

type Tone = SignalTaskType['color'];

export function TrophyCup({ tone, faint }: { tone: Tone; faint?: boolean }) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  return <svg className={`signal-cup tone-${tone} ${faint ? 'is-faint' : ''}`} viewBox="0 0 120 140" aria-hidden="true">
    <defs>
      <clipPath id={`cup-${uid}`}><path d="M30 18 H90 V40 Q90 66 60 70 Q30 66 30 40 Z" /></clipPath>
      <pattern id={`cup-dots-${uid}`} width="9" height="9" patternUnits="userSpaceOnUse"><circle cx="2.5" cy="2.5" r="1.6" /></pattern>
    </defs>
    <path className="cup-handle-ink" d="M30 26 C13 26 13 50 33 54" />
    <path className="cup-handle-ink" d="M90 26 C107 26 107 50 87 54" />
    <path className="cup-handle" d="M30 26 C13 26 13 50 33 54" />
    <path className="cup-handle" d="M90 26 C107 26 107 50 87 54" />
    <path className="cup-bowl" d="M30 18 H90 V40 Q90 66 60 70 Q30 66 30 40 Z" />
    <g clipPath={`url(#cup-${uid})`}>
      <rect className="cup-ribbon" x="28" y="42" width="64" height="9" />
      <polygon className="cup-shine" points="61,18 70,18 58,70 51,70" />
      <rect className="cup-dots" x="28" y="52" width="64" height="22" fill={`url(#cup-dots-${uid})`} />
      <polygon className="cup-star" points="60,26 61.9,31.4 67.6,31.5 63.0,35.0 64.7,40.5 60,37.2 55.3,40.5 57.0,35.0 52.4,31.5 58.1,31.4" />
    </g>
    <rect className="cup-stem" x="54" y="70" width="12" height="13" />
    <rect className="cup-base-top" x="44" y="83" width="32" height="8" />
    <rect className="cup-base" x="36" y="91" width="48" height="11" />
    <rect className="cup-base-inset" x="40" y="95" width="40" height="3" />
  </svg>;
}

export function TrophyGallery({ trophies, taskTypes, theme, busy, leaving, onClose, onFocus }: { trophies: TrophyEntry[]; taskTypes: SignalTaskType[]; theme: 'day' | 'night'; busy: boolean; leaving: boolean; onClose: () => void; onFocus: (id: string) => void }) {
  const backButton = useRef<HTMLButtonElement>(null);
  useEffect(() => { backButton.current?.focus(); }, []);
  const toneOf = (goal: Goal): Tone => taskTypes.find((type) => type.value === goal.taskType)?.color ?? 'purple';

  return <section className={`signal-trophy-gallery ${theme === 'night' ? 'is-night' : ''} ${leaving ? 'is-leaving' : ''}`} role="dialog" aria-modal="true" aria-label="奖杯陈列室">
    <header className="signal-trophy-bar">
      <div><span>05 / TROPHY GALLERY</span><h2>奖杯陈列室<em>每一座，都是一次说到做到。</em></h2></div>
      <div className="signal-trophy-station" aria-hidden="true"><b>TRO<br />PHY</b><span>SECURED COORDINATES</span><i>✦ ━━━ ✦</i></div>
      <button ref={backButton} className="signal-trophy-back" onClick={onClose}><b>← 返回频道</b><span>BACK TO CHANNEL / ESC</span></button>
    </header>
    {trophies.length ? <div className="signal-trophy-shelf">
      {trophies.map(({ goal, index }, order) => {
        const tone = toneOf(goal);
        return <button key={goal.id} type="button" className={`signal-trophy tone-${tone}`} disabled={busy} style={{ '--trophy-i': order } as CSSProperties} onClick={() => onFocus(goal.id)} aria-label={`查看奖杯 NO.${String(index).padStart(2, '0')} ${goal.title}`}>
          <span className="signal-trophy-cup"><TrophyCup tone={tone} /></span>
          <span className="signal-trophy-plank" aria-hidden="true" />
          <span className="signal-trophy-plate">
            <span className="signal-trophy-plate-head"><small>NO.{String(index).padStart(2, '0')}</small><i className={`tone-${tone}`}>{goal.taskType}</i></span>
            <strong title={goal.title}>{goal.title}</strong>
            <span className="signal-trophy-note" title={goal.description || undefined}>{goal.description || '—'}</span>
            <span className="signal-trophy-date">✦ 达成 {goal.completedDate.replaceAll('-', '.')}</span>
          </span>
        </button>;
      })}
    </div> : <div className="signal-trophy-empty">
      <TrophyCup tone="yellow" faint />
      <span className="signal-trophy-empty-plank" aria-hidden="true" />
      <b>陈列室还是空的</b>
      <small>FIRST TROPHY AWAITS</small>
      <p>完成一个目标，它就会变成奖杯，永远立在这里。</p>
    </div>}
    <footer className="signal-trophy-foot"><span>SECURED COORDINATES</span><span>每一座奖杯都是一次说到做到</span></footer>
  </section>;
}
