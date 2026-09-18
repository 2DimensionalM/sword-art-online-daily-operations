'use client';

import { useEffect, useId, useRef, useState } from 'react';

const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六'];

function dateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function dateFromKey(value: string) {
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  return Number.isFinite(date.getTime()) ? date : null;
}

function monthDays(month: Date) {
  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  const start = new Date(first);
  start.setDate(1 - first.getDay());
  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    return date;
  });
}

export function SignalDatePicker({
  kind,
  value,
  disabled,
  onChange,
}: {
  kind: 'goal' | 'message';
  value: string;
  disabled?: boolean;
  onChange: (value: string) => void;
}) {
  const id = useId();
  const root = useRef<HTMLDivElement>(null);
  const selectedDate = dateFromKey(value);
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(value);
  const [month, setMonth] = useState(() => {
    const initial = selectedDate ?? new Date();
    return new Date(initial.getFullYear(), initial.getMonth(), 1);
  });

  useEffect(() => {
    if (!open) return;
    const closeOnOutsideClick = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
        root.current?.querySelector<HTMLButtonElement>('.signal-date-trigger')?.focus();
      }
    };
    document.addEventListener('pointerdown', closeOnOutsideClick);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsideClick);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [open]);

  const showPicker = () => {
    const initial = selectedDate ?? new Date();
    setPending(value);
    setMonth(new Date(initial.getFullYear(), initial.getMonth(), 1));
    setOpen(true);
  };
  const chooseToday = () => {
    const today = new Date();
    setPending(dateKey(today));
    setMonth(new Date(today.getFullYear(), today.getMonth(), 1));
  };
  const confirm = () => {
    if (!pending) return;
    onChange(pending);
    setOpen(false);
  };

  return <div ref={root} className={`signal-date-picker ${open ? 'is-open' : ''}`}>
    <button
      type="button"
      className="signal-date-trigger"
      aria-expanded={open}
      aria-controls={`${id}-panel`}
      disabled={disabled}
      onClick={() => open ? setOpen(false) : showPicker()}
    >
      <span aria-hidden="true">{kind === 'goal' ? '◆' : '✦'}</span>
      <strong>{value ? value.replaceAll('-', ' / ') : 'SELECT DATE / 选择日期'}</strong>
      <i aria-hidden="true">{open ? '▲' : '▼'}</i>
    </button>
    {open && <section id={`${id}-panel`} className="signal-date-panel" role="dialog" aria-modal="false" aria-label={kind === 'goal' ? '选择目标截止日期' : '选择寄语日期'}>
      <header>
        <button type="button" aria-label="上一个月" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}>‹</button>
        <div><small>SELECT MONTH</small><strong>{month.getFullYear()} / {String(month.getMonth() + 1).padStart(2, '0')}</strong></div>
        <button type="button" aria-label="下一个月" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}>›</button>
      </header>
      <div className="signal-date-weekdays" aria-hidden="true">{WEEKDAYS.map((day) => <span key={day}>{day}</span>)}</div>
      <div className="signal-date-days" role="group" aria-label={`${month.getFullYear()} 年 ${month.getMonth() + 1} 月`}>
        {monthDays(month).map((date) => {
          const key = dateKey(date);
          const outside = date.getMonth() !== month.getMonth();
          return <button
            type="button"
            key={key}
            className={`${outside ? 'outside' : ''} ${pending === key ? 'active' : ''} ${key === dateKey(new Date()) ? 'today' : ''}`}
            aria-pressed={pending === key}
            aria-label={`${date.getFullYear()} 年 ${date.getMonth() + 1} 月 ${date.getDate()} 日${key === dateKey(new Date()) ? '，今天' : ''}`}
            onClick={() => {
              setPending(key);
              if (outside) setMonth(new Date(date.getFullYear(), date.getMonth(), 1));
            }}
          >{date.getDate()}</button>;
        })}
      </div>
      <footer>
        <button type="button" className="signal-date-clear" onClick={() => { onChange(''); setOpen(false); }}>清除</button>
        <button type="button" onClick={chooseToday}>今天</button>
        <button type="button" className="signal-date-confirm" disabled={!pending} onClick={confirm}>确认日期 →</button>
      </footer>
    </section>}
  </div>;
}
