'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { focusClock, focusDuration, type FocusCommand, type FocusState } from '../lib/focus-model';
import { leaveFocusOnPageHide, loadFocusState, sendFocusCommand, updateFocusPresence } from '../lib/planner-store';
import { StudyScene } from './StudyScene';

export function LockinSpace({ taskId, beforeEnter, onExit }: { taskId: string; beforeEnter: () => Promise<void>; onExit: () => void }) {
  const [prepare] = useState(() => beforeEnter);
  const [exit] = useState(() => onExit);
  const [spaceToken, setSpaceToken] = useState('');
  const [state, setState] = useState<FocusState | null>(null);
  const [now, setNow] = useState(Date.now);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [feedback, setFeedback] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const owner = useRef('');
  const current = useRef<FocusState | null>(null);
  const pending = useRef<FocusCommand | null>(null);
  const locked = useRef(false);
  const alive = useRef(false);
  const leavingRef = useRef(false);
  const offset = useRef(0);
  const accept = useCallback((next: FocusState) => {
    if (!alive.current) return;
    if (current.current && (next.revision < current.current.revision || (next.revision === current.current.revision && next.serverNow < current.current.serverNow))) return;
    current.current = next;
    offset.current = Date.parse(next.serverNow) - Date.now();
    setState(next);
    setSpaceToken(owner.current);
    setNow(Date.now() + offset.current);
  }, []);

  const start = useCallback(async () => {
    if (locked.current) return;
    locked.current = true;
    setBusy(true);
    try {
      await prepare();
      const latest = await loadFocusState();
      if (!alive.current || leavingRef.current) return;
      accept(latest);
      if (latest.sessions.some((item) => item.spaceId === owner.current && !item.endedAt)) { pending.current = null; setError(''); return; }
      const payload = pending.current ?? { action: 'start', taskIds: [taskId], spaceId: owner.current, requestId: crypto.randomUUID(), expectedRevision: latest.revision };
      pending.current = payload;
      const result = await sendFocusCommand(payload);
      if (!alive.current) return;
      accept(result.state);
      pending.current = null;
      if (result.conflicted) throw new Error('任务状态已更新，请重新连接空间。');
      setError('');
    } catch (cause) {
      if (!alive.current) return;
      if (cause instanceof Error && 'confirmedRejected' in cause) pending.current = null;
      setError(cause instanceof Error ? cause.message : '未能连接空间，请重试。');
    } finally { locked.current = false; if (alive.current) setBusy(false); }
  }, [accept, prepare, taskId]);

  useEffect(() => {
    alive.current = true;
    owner.current = crypto.randomUUID();
    const spaceId = owner.current;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const surface = dialog.current;
    surface?.showModal();
    const initial = window.setTimeout(() => void start(), 0);
    const pagehide = () => leaveFocusOnPageHide(spaceId);
    window.addEventListener('pagehide', pagehide);
    let syncing = false;
    const syncPresence = async () => {
      if (syncing || locked.current || leavingRef.current || !alive.current) return;
      syncing = true;
      try {
        const next = await updateFocusPresence(spaceId);
        if (owner.current !== spaceId) return;
        accept(next);
        if (!pending.current && next.sessions.some((item) => item.spaceId === spaceId)) setError('');
      } catch { if (alive.current) setError('连接暂时中断 · 本轮仍在计时，正在自动重连。'); }
      finally { syncing = false; }
    };
    const reconnect = () => {
      setNow(Date.now() + offset.current);
      void syncPresence();
    };
    const visible = () => { if (!document.hidden) reconnect(); };
    const sync = window.setInterval(() => void syncPresence(), 5000);
    document.addEventListener('visibilitychange', visible);
    window.addEventListener('focus', reconnect);
    window.addEventListener('online', reconnect);
    return () => {
      alive.current = false;
      clearTimeout(initial);
      clearInterval(sync);
      window.removeEventListener('pagehide', pagehide);
      document.removeEventListener('visibilitychange', visible);
      window.removeEventListener('focus', reconnect);
      window.removeEventListener('online', reconnect);
      leaveFocusOnPageHide(spaceId);
      surface?.close();
      document.body.style.overflow = overflow;
      previous?.focus();
    };
  }, [accept, start]);

  useEffect(() => {
    if (leaving) return;
    const timer = window.setInterval(() => setNow(Date.now() + offset.current), 250);
    return () => clearInterval(timer);
  }, [leaving]);
  useEffect(() => {
    if (!feedback) return;
    const timer = window.setTimeout(() => setFeedback(false), 1400);
    return () => clearTimeout(timer);
  }, [feedback]);

  async function leave() {
    if (leavingRef.current) return;
    leavingRef.current = true;
    setLeaving(true);
    try {
      const next = await updateFocusPresence(owner.current, true);
      accept(next);
      if (next.sessions.some((session) => session.spaceId === owner.current && !session.endedAt)) throw new Error('停计尚未确认，请重试。');
      dialog.current?.close();
      exit();
    } catch (cause) {
      leavingRef.current = false;
      setLeaving(false);
      setError(cause instanceof Error ? cause.message : '退出尚未确认，请重试。');
    }
  }

  async function transition(action: 'drift' | 'break' | 'resume' | 'finish') {
    const latest = current.current;
    const session = latest?.sessions.find((item) => item.spaceId === owner.current && !item.endedAt);
    if (!latest || !session || locked.current || leavingRef.current) return;
    locked.current = true;
    setBusy(true);
    try {
      const payload = pending.current ?? { action, sessionId: session.id, spaceId: owner.current, ...(action === 'resume' ? { taskIds: [taskId] } : {}), requestId: crypto.randomUUID(), expectedRevision: latest.revision };
      pending.current = payload;
      const result = await sendFocusCommand(payload);
      accept(result.state);
      pending.current = null;
      if (result.conflicted) throw new Error('状态已同步，请再试一次。');
      setError('');
      if (action === 'drift') setFeedback(true);
    } catch (cause) {
      if (cause instanceof Error && 'confirmedRejected' in cause) pending.current = null;
      if (alive.current) setError(cause instanceof Error ? cause.message : '记录未保存，请重试。');
    } finally { locked.current = false; if (alive.current) setBusy(false); }
  }

  const session = state?.sessions.find((item) => item.spaceId === spaceToken);
  const active = session?.phase === 'focus' && !session.endedAt;
  const resting = session?.phase === 'break' && !session.endedAt;
  const elapsed = session ? focusDuration(session, now) : 0;
  const target = session?.minimumMinutes ?? state?.settings.minimumMinutes ?? 8;
  const met = elapsed >= target * 60_000;
  const restDuration = (session?.breakMinutes ?? 3) * 60_000;
  const restRemaining = resting && session.focusEndedAt ? Math.max(0, restDuration - (now - Date.parse(session.focusEndedAt))) : 0;
  return <dialog ref={dialog} className={`lockin-space ${active ? 'is-focusing' : ''} ${leaving ? 'is-leaving' : ''}`} aria-labelledby="lockin-space-title" onCancel={(event) => { event.preventDefault(); }}>
    <StudyScene />
    <div className="space-grain" aria-hidden="true" />
    <header className="space-topbar"><span><i /> {active ? 'ON AIR' : resting ? 'INTERMISSION' : session?.endedAt ? 'SESSION SAVED' : 'TUNING IN'}</span><span>DAILY OPS / PRIVATE STUDY</span></header>
    <div className="space-identity"><span className="space-kicker">YOU ARE NOW ENTERING</span><h2 id="lockin-space-title">LOCK <em>IN.</em></h2><p>现在，只做这一件事。</p></div>
    <section className="space-mission" aria-label="当前专注任务"><span>◈ CURRENT MISSION</span><h3>{session?.tasks[0]?.title ?? state?.eligibleTasks.find((task) => task.id === taskId)?.title ?? '正在连接你的任务…'}</h3><small>{session?.tasks[0]?.taskType ?? 'STUDY / CERTIFICATE / REVIEW'}</small></section>
    <section className="space-timer" aria-label={resting ? '休息倒计时' : '专注计时'}><div className="space-timer-label"><span>{session?.endedAt ? '计时已停止' : resting ? restRemaining ? 'TAKE A BREATHER' : 'READY WHEN YOU ARE' : met ? 'LIMIT BREAK' : 'STAY WITH IT'}</span><b>{resting ? 'Ⅱ' : met ? '★' : '▶'}</b></div><time role="timer" aria-label={resting ? '剩余休息时间' : '本轮专注时长'}>{focusClock(resting ? restRemaining : elapsed)}</time><div className="space-progress" aria-label={resting ? `休息 ${session.breakMinutes} 分钟` : `起步目标 ${target} 分钟`}><i style={{ width: `${resting ? restRemaining / restDuration * 100 : Math.min(100, elapsed / (target * 60000) * 100)}%` }} /></div><p>{session?.endedAt ? '本轮已保存，可以再开一轮或退出空间。' : resting ? restRemaining ? `休息 ${session.breakMinutes} 分钟 · 专注计时已暂停。` : '休息结束，准备好再继续。' : met ? '进入状态了，按自己的节奏继续。' : `先专注 ${target} 分钟，慢慢进入状态。`}</p>{(active || resting) && <div className="space-pace-actions"><button className="space-pace-action" disabled={busy || leaving || !!error} onClick={() => void transition(resting ? 'resume' : 'break')}>{resting ? '继续专注 ↗' : `休息 ${session.breakMinutes} 分钟`}</button><button className="space-round-finish" disabled={busy || leaving || !!error} onClick={() => void transition('finish')}>结束本轮 ■</button></div>}{session?.endedAt && <button className="space-pace-action" disabled={busy || leaving || !!error} onClick={() => void start()}>再开一轮 ↗</button>}</section>
    <footer className="space-controls"><button type="button" className="space-drift" disabled={!active || busy || leaving || !!error} onClick={() => void transition('drift')}><b>↩</b><span>分心了，回来<small>LOCK BACK IN · {session?.drifts.length ?? 0}</small></span></button><span className="space-quiet-note">ONE MISSION.<br />ONE MOMENT.</span><button type="button" className="space-exit" disabled={leaving} onClick={() => void leave()}><span>{leaving ? '正在停计…' : '退出空间'}<small>STOP & RETURN</small></span><b>↗</b></button></footer>
    {error && <div className="space-connection" role="alert"><span>{error}</span><button disabled={busy || leaving} onClick={() => void (session && pending.current?.action !== 'start' ? pending.current && ['drift', 'break', 'resume', 'finish'].includes(pending.current.action) ? transition(pending.current.action as 'drift' | 'break' | 'resume' | 'finish') : updateFocusPresence(owner.current).then((next) => { accept(next); setError(''); }).catch(() => setError('空间连接中断，请重试。')) : start())}>重新连接</button></div>}
    {feedback && <div className="space-feedback" role="status"><strong>GOOD CATCH.</strong><span>觉察到，就回来。</span></div>}
    <div className="space-entry-flash" aria-hidden="true"><strong>LOCK IN!</strong><span>ENTER YOUR STUDY SPACE</span></div>
  </dialog>;
}
