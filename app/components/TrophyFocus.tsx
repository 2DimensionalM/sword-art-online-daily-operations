'use client';

import { useEffect, useRef, useState } from 'react';
import type { Goal } from '../lib/signal-store';
import { lockScroll, unlockScroll } from '../lib/scroll-lock';
import type { SignalTaskType } from './SignalRoom';
import { TrophyCup } from './TrophyGallery';

export function TrophyFocus({ goal, tone, index, busy, onClose, onRestore, onDelete }: { goal: Goal; tone: SignalTaskType['color']; index: number; busy: boolean; onClose: () => void; onRestore: () => void; onDelete: () => void }) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLElement>(null);
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    lockScroll();
    closeRef.current?.focus();
    return () => {
      unlockScroll();
      previousFocus?.focus();
    };
  }, []);

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
      if (event.key !== 'Tab') return;
      const focusable = dialogRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled), [href], [tabindex]:not([tabindex="-1"])');
      if (!focusable?.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [onClose]);

  const diff = Math.round((Date.parse(goal.date) - Date.parse(goal.completedDate)) / 86400000);
  const diffCopy = diff > 0 ? `提前 ${diff} 天达成` : diff < 0 ? `逾期 ${-diff} 天达成` : '压线达成';

  return <div className="signal-trophy-focus-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section ref={dialogRef} className={`signal-trophy-focus tone-${tone}`} role="dialog" aria-modal="true" aria-labelledby="signal-trophy-focus-title">
      <button ref={closeRef} type="button" className="signal-trophy-focus-close" onClick={onClose} aria-label="关闭奖杯特写">×</button>
      <div className="signal-trophy-focus-stage" aria-hidden="true">
        <TrophyCup tone={tone} />
        <span className="signal-trophy-focus-plank" />
      </div>
      <div className="signal-trophy-focus-detail">
        <header><span>SECURED COORDINATE / 已达成坐标</span><h2 id="signal-trophy-focus-title">{goal.title}</h2></header>
        <div className="signal-trophy-focus-stats">
          <span><small>NO.</small><b>{String(index).padStart(2, '0')}</b></span>
          <span><small>达成</small><b>{goal.completedDate.replaceAll('-', '.')}</b></span>
          <span><small>原定截止</small><b>{goal.date.replaceAll('-', '.')}</b></span>
          <span className="signal-trophy-focus-delta"><small>时差</small><b>{diffCopy}</b></span>
        </div>
        <div className="signal-trophy-focus-tag"><i className={`tone-${tone}`}>{goal.taskType}</i></div>
        <p className="signal-trophy-focus-notes">{goal.description || '没有补充描述，但奖杯本身就是证词。'}</p>
        <footer>
          {confirming && <div className="signal-trophy-confirm" role="alertdialog" aria-label={`确认移除奖杯「${goal.title}」`}>
            <strong>确定移除这座奖杯？</strong>
            <small>记录将从心愿放送室与所有频道同步消失，无法挽回。</small>
            <div>
              <button type="button" className="signal-trophy-confirm-yes" disabled={busy} onClick={onDelete}>{busy ? '正在移除…' : '确认移除'}</button>
              <button type="button" className="signal-trophy-confirm-no" disabled={busy} onClick={() => setConfirming(false)}>保留奖杯</button>
            </div>
          </div>}
          <button type="button" className="signal-trophy-restore" disabled={busy} onClick={onRestore}><b>↺ 恢复目标</b><span>RESTORE</span></button>
          {!confirming && <button type="button" className="signal-trophy-remove" disabled={busy} onClick={() => setConfirming(true)}><b>删除 ×</b><span>REMOVE</span></button>}
          <span className="signal-trophy-focus-hint">ESC / CLICK OUTSIDE TO CLOSE</span>
        </footer>
      </div>
    </section>
  </div>;
}
