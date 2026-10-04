'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { eligibleFocusTasks, focusClock, focusDuration, type FocusCommand, type FocusSession, type FocusState } from '../lib/focus-model';
import { loadFocusState, sendFocusCommand } from '../lib/planner-store';
import { LockinDialog } from './LockinDialog';
import { LockinRecords } from './LockinRecords';

type Feedback = { kind: 'lock' | 'rest' | 'start'; id: number };
const CURTAIN_IDLE_MS = 30_000;

export function LockinChannel({ onCompleteTask, onOpenBoard }: { onCompleteTask: (id: string) => void; onOpenBoard: () => void }) {
  const [state, setState] = useState<FocusState | null>(null);
  const [now, setNow] = useState(0);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [hasPending, setHasPending] = useState(false);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [excluded, setExcluded] = useState<string[]>([]);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [minimum, setMinimum] = useState('8');
  const [rest, setRest] = useState('3');
  const [section, setSection] = useState<'today' | 'archive' | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<FocusSession | null>(null);
  const [completing, setCompleting] = useState<string | null>(null);
  const [curtainClosed, setCurtainClosed] = useState(false);
  const pending = useRef<FocusCommand | null>(null);
  const locked = useRef(false);
  const offset = useRef(0);
  const mounted = useRef(true);
  const accept = useCallback((next: FocusState) => {
    if (!mounted.current) return;
    offset.current = Date.parse(next.serverNow) - Date.now();
    setNow(Date.now() + offset.current);
    setState((current) => !current || next.revision >= current.revision ? next : current);
    setCompleting((current) => next.eligibleTasks.some((task) => task.id === current) ? current : null);
  }, []);
  const refresh = useCallback(async () => {
    try { accept(await loadFocusState()); if (!pending.current) setError(''); }
    catch { if (mounted.current) setError('连接中断'); }
  }, [accept]);

  useEffect(() => {
    mounted.current = true;
    const initial = setTimeout(() => void refresh(), 0);
    const clock = setInterval(() => setNow(Date.now() + offset.current), 250);
    const sync = setInterval(() => { if (!locked.current && document.visibilityState === 'visible') void refresh(); }, 1000);
    const visible = () => { if (document.visibilityState === 'visible') void refresh(); };
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', visible);
    return () => { mounted.current = false; clearTimeout(initial); clearInterval(clock); clearInterval(sync); window.removeEventListener('focus', refresh); document.removeEventListener('visibilitychange', visible); };
  }, [refresh]);
  useEffect(() => {
    if (!feedback) return;
    const timeout = setTimeout(() => setFeedback(null), 900);
    return () => clearTimeout(timeout);
  }, [feedback]);
  useEffect(() => {
    if (!completing) return;
    const timeout = setTimeout(() => { setCompleting(null); setError('任务尚未同步，请重试'); }, 8000);
    return () => clearTimeout(timeout);
  }, [completing]);

  async function command(action: FocusCommand['action'], fields: Partial<FocusCommand> = {}) {
    if (!state || locked.current) return;
    locked.current = true;
    setBusy(true);
    const payload = pending.current ?? { ...fields, action, sessionId: active?.id, requestId: crypto.randomUUID(), expectedRevision: state.revision };
    pending.current = payload;
    setHasPending(true);
    try {
      const result = await sendFocusCommand(payload);
      pending.current = null;
      setHasPending(false);
      accept(result.state);
      if (result.conflicted) setError('状态已更新，请重试');
      else {
        setError('');
        if (payload.action === 'drift') setFeedback({ kind: 'lock', id: result.state.revision });
        if (['start', 'resume'].includes(payload.action)) setFeedback({ kind: 'start', id: result.state.revision });
        if (payload.action === 'break') setFeedback({ kind: 'rest', id: result.state.revision });
        if (payload.action === 'settings') setSettingsOpen(false);
        if (payload.action === 'deleteSession') setDeleteTarget(null);
      }
    } catch (cause) {
      if (cause instanceof Error && 'confirmedRejected' in cause) { pending.current = null; setHasPending(false); }
      setError(cause instanceof Error ? cause.message : '未保存，请重试');
    } finally { locked.current = false; if (mounted.current) setBusy(false); }
  }

  const candidates = eligibleFocusTasks(state?.eligibleTasks ?? []);
  const selected = candidates.filter((task) => !excluded.includes(task.id));
  const active = state?.sessions.find((session) => !session.endedAt);
  const focusing = active?.phase === 'focus';
  const resting = active?.phase === 'break';
  const elapsed = active ? focusDuration(active, now) : 0;
  const breakElapsed = resting ? Math.max(0, now - Date.parse(active.focusEndedAt!)) : 0;
  const breakRemaining = active ? Math.max(0, active.breakMinutes * 60000 - breakElapsed) : 0;
  const curtainEnabled = focusing || (resting && breakRemaining > 0);
  const minimumMet = active && elapsed >= active.minimumMinutes * 60000;
  const disabled = busy || hasPending;
  const linked = focusing ? active.tasks : selected;
  const last = state?.sessions[0];
  const progress = Math.min(100, resting ? breakElapsed / (active.breakMinutes * 60000) * 100 : elapsed / ((active?.minimumMinutes ?? state?.settings.minimumMinutes ?? 8) * 60000) * 100);

  useEffect(() => {
    if (!curtainEnabled) return;
    let idleTimer: ReturnType<typeof setTimeout>;
    const reset = () => {
      setCurtainClosed(false);
      clearTimeout(idleTimer);
      idleTimer = setTimeout(() => setCurtainClosed(true), CURTAIN_IDLE_MS);
    };
    const onInteraction = () => reset();
    reset();
    document.addEventListener('pointerdown', onInteraction);
    document.addEventListener('keydown', onInteraction);
    document.addEventListener('wheel', onInteraction);
    return () => {
      clearTimeout(idleTimer);
      document.removeEventListener('pointerdown', onInteraction);
      document.removeEventListener('keydown', onInteraction);
      document.removeEventListener('wheel', onInteraction);
    };
  }, [curtainEnabled]);

  return <section className="lockin-channel" data-expanded={!!section} aria-label="专注频道">
    <header className="lockin-masthead"><h2>LOCKIN <em>CHANNEL</em></h2><div><span className="lockin-live-dot" />{focusing ? 'ON AIR' : resting ? 'RESET' : 'READY'}</div></header>
    {error && <div className="lockin-error" role="alert"><span>{error}</span><button disabled={busy} onClick={() => pending.current ? void command(pending.current.action) : void refresh()}>重试</button>{hasPending && <button disabled={busy} onClick={() => { pending.current = null; setHasPending(false); setError(''); void refresh(); }}>取消</button>}</div>}
    {!state ? <div className="lockin-loading" role="status">TUNING IN…</div> : <>
      <div className="lockin-workbench">
        <section className={`lockin-console ${resting ? 'is-resting' : ''}`} aria-label="注意力计时">
          <div className="lockin-console-top"><span>{resting ? 'TAKE A BREATHER' : minimumMet ? 'LIMIT BREAK ✓' : 'FOCUS MODE'}</span><button aria-label="计时设置" onClick={() => { setMinimum(String(state.settings.minimumMinutes)); setRest(String(state.settings.breakMinutes)); setSettingsOpen(true); }}>⚙</button></div>
          <div className={`lockin-screen ${curtainEnabled && curtainClosed ? 'is-veiled' : ''}`}>
            <div className="lockin-reticle" aria-hidden="true"><i /><i /><i /><i /><b /></div>
            <div className="lockin-time" role="timer" aria-label={resting ? '休息倒计时' : '本轮计时'}>{focusClock(resting ? breakRemaining : elapsed)}</div>
            <span className="lockin-cue">{resting ? breakRemaining ? '慢慢来。' : '准备好了就回来。' : focusing ? minimumMet ? '状态正好，继续。' : '就在这一刻。' : last?.endReason === 'tasks-inactive' ? '本轮已停计 ✓' : '准备好，锁定。'}</span>
            <div className="lockin-curtain" aria-hidden="true"><div className="lockin-curtain-inner"><span className="lockin-curtain-kicker">LOCKIN CHANNEL / {resting ? 'RESET' : 'ON AIR'}</span><span className="lockin-curtain-mark">◈</span><strong>{resting ? '安心休息' : '此刻，专注'}</strong><small>时间仍在继续 · 交互后查看</small></div><span className="lockin-curtain-hem" /></div>
          </div>
          <div className="lockin-meter"><span>{resting ? 'RESET' : 'TARGET'}</span><div aria-hidden="true"><i style={{ width: `${progress}%` }} /></div><b>{resting ? active.breakMinutes : active?.minimumMinutes ?? state.settings.minimumMinutes}<small> MIN</small></b></div>
          <div className="lockin-actions">
            {focusing ? <><button className="lockin-primary" disabled={disabled} onClick={() => void command('drift')}><b>↩</b><span>分心了<small>LOCK BACK IN</small></span></button><button disabled={disabled} onClick={() => void command('break')}><b>Ⅱ</b><span>休息一下<small>TAKE A BREAK</small></span></button></> : <button className="lockin-primary" disabled={disabled || !selected.length} onClick={() => void command(resting ? 'resume' : 'start', { taskIds: selected.map((task) => task.id) })}><b>▶</b><span>{resting ? '我准备好了' : '开始专注'}<small>LOCK IN</small></span></button>}
          </div>
          <div className="lockin-session-strip"><span title="发现分心次数">↩ {active?.drifts.length ?? 0}</span>{active ? <button disabled={disabled} onClick={() => void command('finish')}>结束本轮 ↗</button> : <span />}</div>
          {feedback && <div key={feedback.id} className={`lockin-impact impact-${feedback.kind}`} role="status"><div className="lockin-impact-rings" aria-hidden="true"><i /><i /><i /></div><div className="lockin-impact-copy"><span>{feedback.kind === 'rest' ? 'YOU EARNED A BREATHER' : feedback.kind === 'start' ? 'THIS IS YOUR MOMENT' : 'GOOD CATCH'}</span><strong>{feedback.kind === 'rest' ? 'BREATHE.' : 'LOCK IN!'}</strong><small>{feedback.kind === 'rest' ? '放松一下。' : '觉察到，就回来。'}</small></div></div>}
        </section>
        <aside className="lockin-links" aria-label="关联任务">
          <header><div><span>IN PLAY</span><h3>当前任务</h3></div><strong>{String(linked.length).padStart(2, '0')}</strong></header>
          <div className="lockin-task-list">
            {(focusing ? active.tasks : candidates).map((task, index) => {
              const detached = 'unlinkedAt' in task && !!task.unlinkedAt;
              const done = detached && 'finalStatus' in task && task.finalStatus === 'completed';
              return <article className={`lockin-task ${detached ? 'is-detached' : ''} ${!focusing && excluded.includes(task.id) ? 'is-excluded' : ''}`} key={task.id}>
                <span className="lockin-task-index">{String(index + 1).padStart(2, '0')}</span>
                <div><span className="lockin-task-type">{task.taskType}</span><strong>{task.title}</strong><small>{detached ? done ? 'CLEAR ✓' : 'STOPPED Ⅱ' : focusing ? '● LIVE' : 'IN PROGRESS'}</small></div>
                {focusing ? detached ? <span className="lockin-task-verdict" aria-label={done ? '已完成' : '已停计'}>{done ? '✓' : 'Ⅱ'}</span> : <button className="lockin-complete" disabled={disabled || completing === task.id} aria-label={`完成任务 ${task.title}`} title="完成任务" onClick={() => { setCompleting(task.id); onCompleteTask(task.id); }}>{completing === task.id ? '…' : '✓'}</button> : <input type="checkbox" aria-label={`关联 ${task.title}`} checked={!excluded.includes(task.id)} disabled={disabled} onChange={(event) => setExcluded((current) => event.target.checked ? current.filter((id) => id !== task.id) : [...current, task.id])} />}
              </article>;
            })}
            {!candidates.length && !focusing && <div className="lockin-empty"><span aria-hidden="true">◎</span><strong>等待下一项任务</strong><button onClick={onOpenBoard}>DAILY OPS ↗</button></div>}
          </div>
          <footer><span>{focusing ? 'LINKED' : `${selected.length} SELECTED`}</span><span>{resting ? `上轮 ${focusClock(elapsed)}` : 'STUDY / CERTIFICATE'}</span></footer>
        </aside>
      </div>
      <nav className="lockin-drawers" aria-label="专注记录"><button aria-expanded={section === 'today'} aria-controls="lockin-record-panel" onClick={() => setSection(section === 'today' ? null : 'today')}><span>今日记录</span><b>ATTENTION</b><i>{section === 'today' ? '−' : '＋'}</i></button><button aria-expanded={section === 'archive'} aria-controls="lockin-record-panel" onClick={() => setSection(section === 'archive' ? null : 'archive')}><span>历史记录</span><b>SESSION ARCHIVE</b><i>{section === 'archive' ? '−' : '＋'}</i></button></nav>
      {section && <LockinRecords section={section} sessions={state.sessions} now={now} onDelete={setDeleteTarget} />}
      {settingsOpen && <LockinDialog title="调整你的节奏" label="TUNE YOUR PACE" onClose={() => setSettingsOpen(false)}><form onSubmit={(event) => { event.preventDefault(); void command('settings', { minimumMinutes: Number(minimum), breakMinutes: Number(rest) }); }}><div className="lockin-setting-fields"><label>起步 / 分钟<input type="number" min="1" max="180" required value={minimum} onChange={(event) => setMinimum(event.target.value)} /></label><label>休息 / 分钟<input type="number" min="1" max="180" required value={rest} onChange={(event) => setRest(event.target.value)} /></label></div><small>下一轮生效</small><footer><button type="button" onClick={() => setSettingsOpen(false)}>返回</button><button disabled={disabled}>确定 →</button></footer></form></LockinDialog>}
      {deleteTarget && <LockinDialog title="删除这次记录？" label="ERASE RECORD" onClose={() => { if (!busy) setDeleteTarget(null); }}><p className="lockin-delete-summary">{deleteTarget.tasks.map((task) => task.title).join(' / ')}<strong>{focusClock(focusDuration(deleteTarget, now))}</strong></p><small>仅删除计时记录，任务保留。</small>{error && <p role="alert">{error}</p>}<footer><button autoFocus disabled={busy} onClick={() => setDeleteTarget(null)}>保留</button><button className="is-destructive" disabled={busy} onClick={() => void command('deleteSession', { targetSessionId: deleteTarget.id })}>删除 ×</button></footer></LockinDialog>}
    </>}
  </section>;
}
