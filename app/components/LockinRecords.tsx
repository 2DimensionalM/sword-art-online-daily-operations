'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { focusClock, focusDuration, type FocusSession } from '../lib/focus-model';

type HistoryRange = 'all' | '7d' | '30d';
const historyRanges: { value: HistoryRange; label: string }[] = [
  { value: 'all', label: '全部记录' },
  { value: '7d', label: '近 7 天' },
  { value: '30d', label: '近 30 天' },
];

export function LockinRecords({ sessions, taskTitles, now, onDelete, paceControls }: { sessions: FocusSession[]; taskTitles: ReadonlyMap<string, string>; now: number; onDelete: (session: FocusSession) => void; paceControls?: ReactNode }) {
  const [historyQuery, setHistoryQuery] = useState('');
  const [historyRange, setHistoryRange] = useState<HistoryRange>('all');
  const [rangeOpen, setRangeOpen] = useState(false);
  const rangeMenuRef = useRef<HTMLDivElement>(null);
  const history = sessions.filter((session) => session.endedAt);
  const normalizedQuery = historyQuery.trim().toLocaleLowerCase('zh-CN');
  const rangeDays = historyRange === '7d' ? 7 : historyRange === '30d' ? 30 : 0;
  const visibleHistory = history.filter((session) => {
    if (rangeDays && Date.parse(session.startedAt) < now - rangeDays * 86_400_000) return false;
    if (!normalizedQuery) return true;
    const searchable = [
      new Date(session.startedAt).toLocaleString('zh-CN'),
      ...session.tasks.flatMap((task) => [taskTitles.get(task.id) ?? task.title, task.taskType]),
    ].join(' ').toLocaleLowerCase('zh-CN');
    return searchable.includes(normalizedQuery);
  });
  const historyFiltered = Boolean(normalizedQuery || historyRange !== 'all');

  useEffect(() => {
    if (!rangeOpen) return;
    const closeOnOutsidePress = (event: MouseEvent) => {
      if (!rangeMenuRef.current?.contains(event.target as Node)) setRangeOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setRangeOpen(false);
    };
    document.addEventListener('mousedown', closeOnOutsidePress);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('mousedown', closeOnOutsidePress);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [rangeOpen]);

  return <section id="lockin-record-panel" className="lockin-record-panel lockin-history-panel" aria-label="历史记录">
    <div className="lockin-history-tools">
      {paceControls}
      <label className="cancellation-search-filter"><span>SEARCH LOG / 搜索记录</span><div className="cancellation-search-control"><i aria-hidden="true">⌕</i><input type="search" value={historyQuery} onChange={(event) => setHistoryQuery(event.target.value)} placeholder="任务标题或类型…" /><em aria-hidden="true">TYPE</em></div></label>
      <div className={`archive-filter lockin-history-range ${rangeOpen ? 'is-open' : ''}`} ref={rangeMenuRef}>
        <span>RANGE / 范围</span>
        <button type="button" className="archive-filter-trigger" aria-label="历史记录时间范围" aria-haspopup="listbox" aria-expanded={rangeOpen} onClick={() => setRangeOpen((open) => !open)}><i aria-hidden="true">◈</i><strong>{historyRanges.find((range) => range.value === historyRange)?.label}</strong><em aria-hidden="true">⌄</em></button>
        {rangeOpen && <div className="archive-filter-menu" role="listbox" aria-label="选择历史记录时间范围"><small>SELECT / 选择</small>{historyRanges.map((range, index) => <button type="button" role="option" aria-selected={historyRange === range.value} className={`archive-filter-option ${historyRange === range.value ? 'active' : ''}`} key={range.value} onClick={() => { setHistoryRange(range.value); setRangeOpen(false); }}><span>{String(index + 1).padStart(2, '0')}</span><strong>{range.label}</strong><i aria-hidden="true">{historyRange === range.value ? '◆' : '›'}</i></button>)}</div>}
      </div>
    </div>
    <div className="cancellation-result-strip lockin-history-status" aria-live="polite"><span>FILTERED SIGNAL</span><strong>{visibleHistory.length} / {history.length} RECORDS</strong>{historyFiltered && <button type="button" onClick={() => { setHistoryQuery(''); setHistoryRange('all'); setRangeOpen(false); }}>CLEAR FILTER ×</button>}</div>
    <div className="lockin-record-scroll" tabIndex={0} aria-label="历史记录筛选结果，可滚动">
      {!history.length ? <p className="lockin-empty-record">NO RECORDS YET</p> : !visibleHistory.length ? <p className="lockin-empty-record">NO MATCHING RECORDS<br /><small>没有找到匹配的专注记录</small></p> : visibleHistory.map((session) => <article className="lockin-record" key={session.id}>
        <details><summary><time>{new Date(session.startedAt).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}</time><strong>{session.tasks.map((task) => taskTitles.get(task.id) ?? task.title).join(' / ')}</strong><b>{focusClock(focusDuration(session, now))}</b><span>↩ {session.drifts.length}</span></summary>
          <div className="lockin-record-detail">
            {session.tasks.map((task) => <p key={task.id}>{taskTitles.get(task.id) ?? task.title}<b>{focusClock(Math.max(0, Math.min(Date.parse(task.unlinkedAt ?? session.focusEndedAt!), Date.parse(session.focusEndedAt!)) - Date.parse(session.startedAt)))}</b></p>)}
            {session.drifts.map((drift, index) => <p key={index}>↩ {focusClock(Date.parse(drift.at) - Date.parse(session.startedAt))}<span>发现分心</span></p>)}
          </div>
        </details><button className="lockin-delete" aria-label={`删除记录 ${new Date(session.startedAt).toLocaleString('zh-CN')}`} onClick={() => onDelete(session)}>×</button>
      </article>)}
    </div>
  </section>;
}
