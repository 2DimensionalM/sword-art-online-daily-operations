'use client';

import { focusClock, focusDayKey, focusDayStats, focusDuration, type FocusSession } from '../lib/focus-model';

export function LockinRecords({ sessions, now, section, onDelete }: { sessions: FocusSession[]; now: number; section: 'today' | 'archive'; onDelete: (session: FocusSession) => void }) {
  const today = focusDayStats(sessions, new Date(now), now);
  const days = Array.from({ length: 7 }, (_, index) => {
    const day = new Date(now); day.setDate(day.getDate() - 6 + index);
    return { day, ...focusDayStats(sessions, day, now) };
  });
  const maxDay = Math.max(60000, ...days.map((day) => day.total));
  const history = sessions.filter((session) => session.endedAt);
  if (section === 'archive') return <section id="lockin-record-panel" className="lockin-record-panel" aria-label="历史记录">
    {!history.length ? <p className="lockin-empty-record">NO RECORDS YET</p> : history.map((session) => <article className="lockin-record" key={session.id}>
      <details><summary><time>{new Date(session.startedAt).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}</time><strong>{session.tasks.map((task) => task.title).join(' / ')}</strong><b>{focusClock(focusDuration(session, now))}</b><span>↩ {session.drifts.length} / ✓ {session.drifts.filter((drift) => drift.returnedAt).length}</span></summary>
        <div className="lockin-record-detail">
          {session.tasks.map((task) => <p key={task.id}>{task.title}<b>{focusClock(Math.max(0, Math.min(Date.parse(task.unlinkedAt ?? session.focusEndedAt!), Date.parse(session.focusEndedAt!)) - Date.parse(session.startedAt)))}</b></p>)}
          {session.drifts.map((drift, index) => <p key={index}>↩ {focusClock(Date.parse(drift.at) - Date.parse(session.startedAt))}<span>{drift.returnedAt ? '已拉回 ✓' : '未确认'}</span></p>)}
        </div>
      </details><button className="lockin-delete" aria-label={`删除记录 ${new Date(session.startedAt).toLocaleString('zh-CN')}`} onClick={() => onDelete(session)}>×</button>
    </article>)}
  </section>;
  return <section id="lockin-record-panel" className="lockin-record-panel" aria-label="今日记录">
    <div className="lockin-stats">{[['计时', focusClock(today.total)], ['最长一轮', focusClock(today.longest)], ['发现分心', String(today.drifts)], ['已拉回', String(today.returns)]].map(([label, value]) => <article key={label}><span>{label}</span><strong>{value}</strong></article>)}</div>
    <div className="lockin-week" aria-label="七天计时时长">{days.map((day) => <div key={focusDayKey(day.day.getTime())}><span>{Math.floor(day.total / 60000)}m</span><div><i style={{ height: `${day.total / maxDay * 100}%` }} /></div><small>{day.day.getMonth() + 1}/{day.day.getDate()}</small></div>)}</div>
    <small className="lockin-metric-note">计时含分心期间 · 拉回由你确认</small>
  </section>;
}
