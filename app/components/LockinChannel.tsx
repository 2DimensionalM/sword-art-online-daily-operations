'use client';

import { useEffect, useRef, useState } from 'react';
import { focusClock, focusDuration, type FocusCommand, type FocusSession, type FocusState } from '../lib/focus-model';
import { loadFocusState, sendFocusCommand } from '../lib/planner-store';
import { LockinDialog } from './LockinDialog';
import { LockinRecords } from './LockinRecords';

export function LockinSettings({ taskTitles }: { taskTitles: ReadonlyMap<string, string> }) {
  const [state, setState] = useState<FocusState | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [hasPending, setHasPending] = useState(false);
  const [minimum, setMinimum] = useState('8');
  const [rest, setRest] = useState('3');
  const [deleteTarget, setDeleteTarget] = useState<FocusSession | null>(null);
  const pending = useRef<FocusCommand | null>(null);
  const locked = useRef(false);
  async function refresh() {
    try {
      const next = await loadFocusState();
      setState(next);
      setMinimum(String(next.settings.minimumMinutes));
      setRest(String(next.settings.breakMinutes));
      if (!pending.current) setError('');
    } catch { setError('历史记录连接中断，请重试。'); }
  }
  useEffect(() => {
    const timer = setTimeout(() => void refresh(), 0);
    return () => clearTimeout(timer);
  }, []);
  async function command(action: 'settings' | 'deleteSession') {
    if (!state || locked.current) return;
    locked.current = true;
    setBusy(true);
    try {
      const payload = pending.current ?? { action, expectedRevision: state.revision, requestId: crypto.randomUUID(), ...(action === 'settings' ? { minimumMinutes: Number(minimum), breakMinutes: Number(rest) } : { targetSessionId: deleteTarget?.id }) };
      pending.current = payload;
      setHasPending(true);
      const result = await sendFocusCommand(payload);
      pending.current = null;
      setHasPending(false);
      setState(result.state);
      if (result.conflicted) throw new Error('记录已更新，请检查后重试。');
      setDeleteTarget(null);
      setError('');
    } catch (cause) {
      if (cause instanceof Error && 'confirmedRejected' in cause) { pending.current = null; setHasPending(false); }
      setError(cause instanceof Error ? cause.message : '未保存，请重试。');
    } finally { locked.current = false; setBusy(false); }
  }
  return <>
    <section className="settings-panel focus-settings-panel">
      <header><span>05</span><div><h3>FIND YOUR FLOW</h3><p>专注空间 · 节奏与历史</p></div><strong>{state?.sessions.filter((session) => session.endedAt).length ?? '—'} SESSIONS</strong></header>
      <div className="focus-settings-body">
        <div className="focus-settings-rule"><span>SPACE RULE</span><strong>从 IN PROGRESS 的学习、证书或复习任务进入空间。</strong><small>退出即停计 · 历史照常保留</small></div>
        {error && <p className="lockin-error" role="alert">{error}<button disabled={busy} onClick={() => pending.current ? void command(pending.current.action as 'settings' | 'deleteSession') : void refresh()}>重试</button></p>}
        {!state ? <p role="status">TUNING IN…</p> : <>
          <form className="board-focus-pace" onSubmit={(event) => { event.preventDefault(); void command('settings'); }}>
            <label htmlFor="focus-minimum">专注时间 / 分钟<input id="focus-minimum" type="number" min="1" max="180" required disabled={busy || hasPending} value={minimum} onChange={(event) => setMinimum(event.target.value)} /></label>
            <label htmlFor="focus-rest">休息时间 / 分钟<input id="focus-rest" type="number" min="1" max="180" required disabled={busy || hasPending} value={rest} onChange={(event) => setRest(event.target.value)} /></label>
            <button disabled={busy || hasPending}>保存节奏 ↗</button><small>下次进入空间生效</small>
          </form>
          <LockinRecords sessions={state.sessions} taskTitles={taskTitles} now={Date.parse(state.serverNow)} onDelete={(session) => { if (!busy && !pending.current) setDeleteTarget(session); }} />
        </>}
      </div>
    </section>
    {deleteTarget && state && <LockinDialog title="删除专注记录？" label="LOCK IN / REMOVE RECORD" onClose={() => { if (!busy && !pending.current) setDeleteTarget(null); }}>
      {error && <p className="lockin-error" role="alert">{error}<button disabled={busy} onClick={() => pending.current ? void command(pending.current.action as 'settings' | 'deleteSession') : void refresh()}>重试</button></p>}
      <p className="lockin-delete-summary">{deleteTarget.tasks.map((task) => taskTitles.get(task.id) ?? task.title).join(' / ')}<strong>{focusClock(focusDuration(deleteTarget, Date.parse(state.serverNow)))}</strong></p><small>仅删除计时记录，任务保留。</small><footer><button disabled={busy || hasPending} onClick={() => setDeleteTarget(null)}>保留</button><button disabled={busy} onClick={() => void command('deleteSession')}>删除 ×</button></footer>
    </LockinDialog>}
  </>;
}
