'use client';

import { useCallback, useEffect, useRef, useState, type CSSProperties, type FormEvent } from 'react';
import { DiscardSignalDialog } from './DiscardSignalDialog';
import { SignalDatePicker } from './SignalDatePicker';
import { loadSignals, saveSignals, type Goal, type PersonalMessage, type SignalState } from '../lib/signal-store';

export function useSignals() {
  const [state, setState] = useState<SignalState>({ revision: 0, goals: [], messages: [] });
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const locked = useRef(false);
  const generation = useRef(0);
  const refresh = useCallback(async () => {
    if (locked.current) return;
    const request = ++generation.current;
    try {
      const next = await loadSignals();
      if (request !== generation.current) return;
      setState(next); setReady(true); setError('');
    } catch (error) {
      if (request === generation.current) setError(error instanceof Error ? error.message : '读取失败');
    }
  }, []);
  useEffect(() => {
    const timer = window.setTimeout(() => void refresh(), 0);
    const sync = () => { if (document.visibilityState === 'visible') void refresh(); };
    window.addEventListener('focus', sync);
    document.addEventListener('visibilitychange', sync);
    return () => { window.clearTimeout(timer); window.removeEventListener('focus', sync); document.removeEventListener('visibilitychange', sync); };
  }, [refresh]);
  const commit = async (next: SignalState) => {
    if (locked.current || !ready) return false;
    locked.current = true; ++generation.current; setBusy(true); setError('');
    try {
      const result = await saveSignals(next);
      setState(result.state);
      if (result.conflicted) {
        setError('另一页面已更新内容，已读取最新版本。你的草稿仍保留，请核对后再次保存。');
        return false;
      }
      return true;
    } catch (error) { setError(error instanceof Error ? error.message : '保存失败，草稿已保留。'); return false; }
    finally { locked.current = false; setBusy(false); }
  };
  return { state, ready, error, busy, refresh, commit };
}

type Signals = ReturnType<typeof useSignals>;
type Draft = { kind: 'goal' | 'message'; id: string; title: string; description: string; date: string; tag: string; revision: number };
function todayKey() { const now = new Date(); return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`; }
function deadline(date: string, today: string) {
  const days = Math.round((Date.parse(date) - Date.parse(today)) / 86400000);
  return days < 0 ? `已过期 ${-days} 天` : days === 0 ? '今天到期' : `还有 ${days} 天`;
}

export function SignalRoom({ signals, taskTypes, onDirtyChange }: { signals: Signals; taskTypes: string[]; onDirtyChange: (dirty: boolean) => void }) {
  const { state, ready, error, busy, refresh, commit } = signals;
  const [kind, setKind] = useState<'goal' | 'message'>('goal');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(0);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [dirty, setDirty] = useState(false);
  const [deleteId, setDeleteId] = useState('');
  const [notice, setNotice] = useState<'saved' | 'deleted' | ''>('');
  const [pendingAction, setPendingAction] = useState<(() => void) | null>(null);
  const editor = useRef<HTMLFormElement>(null);
  useEffect(() => { onDirtyChange(dirty); return () => onDirtyChange(false); }, [dirty, onDirtyChange]);
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);
  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(''), 5000);
    return () => window.clearTimeout(timer);
  }, [notice]);
  const records = kind === 'goal' ? state.goals : state.messages;
  const filtered = records.filter((item) => `${item.title} ${item.description} ${'taskType' in item ? item.taskType : item.mood}`.toLowerCase().includes(query.toLowerCase()));
  const maxPage = Math.max(0, Math.ceil(filtered.length / 6) - 1);
  const currentPage = Math.min(page, maxPage);
  const askLeave = (action: () => void) => { if (dirty) setPendingAction(() => action); else action(); };
  const open = (item?: Goal | PersonalMessage) => askLeave(() => {
    setDraft({ kind, id: item?.id || crypto.randomUUID(), title: item?.title || '', description: item?.description || '', date: item?.date || (kind === 'goal' ? '' : todayKey()), tag: item ? ('taskType' in item ? item.taskType : item.mood) : kind === 'goal' ? taskTypes[0] || '🧬 个人' : '🙂', revision: state.revision });
    setDirty(false); setDeleteId(''); setNotice('');
    window.setTimeout(() => { editor.current?.scrollIntoView({ block: 'nearest', behavior: 'auto' }); editor.current?.querySelector<HTMLInputElement>('input[name="signal-title"]')?.focus(); }, 0);
  });
  const update = (patch: Partial<Draft>) => { setDraft((current) => current && { ...current, ...patch }); setDirty(true); };
  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (!draft || busy) return;
    const base = { id: draft.id, title: draft.title.trim(), description: draft.description, date: draft.date };
    const next = { ...state, revision: draft.revision };
    if (draft.kind === 'goal') next.goals = [...state.goals.filter((item) => item.id !== draft.id), { ...base, taskType: draft.tag }];
    else next.messages = [...state.messages.filter((item) => item.id !== draft.id), { ...base, mood: draft.tag }];
    if (await commit(next)) { setDraft(null); setDirty(false); setNotice('saved'); setQuery(''); setPage(0); }
    else setDraft((current) => current && { ...current, revision: -1 });
  };
  const remove = async (id: string) => {
    if (await commit({ ...state, goals: state.goals.filter((item) => item.id !== id), messages: state.messages.filter((item) => item.id !== id) })) {
      setDeleteId(''); setNotice('deleted');
      if (draft?.id === id) { setDraft(null); setDirty(false); }
    }
  };
  return <section className="signal-room" aria-label="心愿放送室">
    <header className="signal-masthead"><div><span>CH.05 / YOUR PERSONAL FREQUENCY</span><h2>给未来的自己<br /><em>留一个信号。</em></h2><p>把想抵达的远方、想记住的话，调到同一个频道。</p></div><div className="signal-station" aria-hidden="true"><b>ON<br />AIR</b><span>GOALS × WORDS</span><i>● ━━━ ●</i></div></header>
    <div className="signal-toolbar"><div className="signal-switch" aria-label="内容分类">{(['goal', 'message'] as const).map((value) => <button key={value} aria-pressed={kind === value} onClick={() => { if (value !== kind) askLeave(() => { setKind(value); setPage(0); setQuery(''); setDraft(null); setDirty(false); setDeleteId(''); }); }}><b>{value === 'goal' ? '01 / 目标' : '02 / 寄语'}</b><span>{value === 'goal' ? state.goals.length : state.messages.length}</span></button>)}</div><button className="signal-primary" disabled={!ready || busy} onClick={() => open()}>＋ 新增{kind === 'goal' ? '目标' : '寄语'}</button></div>
    {error && <div className="signal-error" role="alert">{error} <button disabled={busy} onClick={() => void refresh()}>重新读取</button></div>}
    {notice && <div className={`signal-notice is-${notice}`} role="status">
      <span className="signal-notice-mark" aria-hidden="true">{notice === 'saved' ? '✓' : '×'}</span>
      <span className="signal-notice-copy"><b>{notice === 'saved' ? '放送完成' : '信号已撤回'}</b><small>{notice === 'saved' ? '首页 / 底部公告已同步' : '首页 / 底部公告已更新'}</small></span>
      <em>{notice === 'saved' ? 'SYNCED' : 'REMOVED'}</em>
    </div>}
    <div className={`signal-workspace ${draft ? 'has-editor' : ''}`}><div className="signal-library">
      <div className="signal-library-header"><div><h3>{kind === 'goal' ? '远方坐标' : '给自己的话'}</h3><small>{kind === 'goal' ? 'LONG-RANGE OBJECTIVES' : 'LETTERS TO MYSELF'}</small></div><input aria-label="搜索目标与寄语" placeholder="搜索这个频道…" value={query} onChange={(event) => { setQuery(event.target.value); setPage(0); }} /></div>
      {!ready ? <p className="signal-empty">正在接收信号…</p> : !filtered.length ? <div className="signal-empty"><b>{query ? '没有匹配的信号' : kind === 'goal' ? '下一站，想去哪里？' : '有些话，值得反复听见。'}</b><p>{query ? '试试其他关键词。' : '新增第一条内容，让它陪你出现在每一天。'}</p></div> : <div className="signal-cards">{filtered.slice(currentPage * 6, currentPage * 6 + 6).map((item, index) => <article key={item.id} className="signal-card"><header><span>{'taskType' in item ? item.taskType : item.mood}</span><small>NO.{String(currentPage * 6 + index + 1).padStart(2, '0')}</small></header><h4>{item.title}</h4><p>{item.description || '还没有补充描述。'}</p><footer><time dateTime={item.date}>{item.date.replaceAll('-', '.')}</time>{'taskType' in item && <span>{deadline(item.date, todayKey())}</span>}</footer><div className="signal-card-actions"><button disabled={busy} onClick={() => open(item)}>编辑 ↗</button><button disabled={busy} onClick={() => { askLeave(() => { setDraft(null); setDirty(false); setDeleteId(item.id); }); }}>删除</button></div>{deleteId === item.id && <div className="signal-delete" role="group" aria-label="确认删除"><p>删除「{item.title}」？首页和公告也会移除。</p><button disabled={busy} onClick={() => void remove(item.id)}>确认删除</button><button disabled={busy} onClick={() => setDeleteId('')}>保留</button></div>}</article>)}</div>}
      {filtered.length > 6 && <nav className="signal-pagination" aria-label="内容分页"><button disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}>← 上一页</button><span>{currentPage + 1} / {maxPage + 1}</span><button disabled={currentPage === maxPage} onClick={() => setPage(currentPage + 1)}>下一页 →</button></nav>}
    </div>
    {draft && <form ref={editor} className="signal-editor" onSubmit={(event) => void save(event)}><header><small>EDIT SIGNAL / 编辑信号</small><h3>{draft.kind === 'goal' ? '设定远方坐标' : '写给此刻的自己'}</h3></header><fieldset disabled={busy}><label>标题<input name="signal-title" required maxLength={200} value={draft.title} onChange={(event) => update({ title: event.target.value })} /></label><label>{draft.kind === 'goal' ? '任务类型' : '心情'}{draft.kind === 'goal' ? <select value={draft.tag} onChange={(event) => update({ tag: event.target.value })}>{[...new Set([...taskTypes, draft.tag])].map((value) => <option key={value}>{value}</option>)}</select> : <input aria-label="心情" required maxLength={100} value={draft.tag} onChange={(event) => update({ tag: event.target.value })} placeholder="一个表情，或一句心情" />}</label><div className="signal-date-field"><span>{draft.kind === 'goal' ? '截止日期' : '寄语日期'}</span><SignalDatePicker kind={draft.kind} value={draft.date} disabled={busy} onChange={(date) => update({ date })} /></div><label>描述<textarea rows={6} maxLength={10000} value={draft.description} onChange={(event) => update({ description: event.target.value })} /></label></fieldset>
      {(draft.revision !== state.revision) && <div className="signal-error">请核对最新列表后确认保留此草稿。<button type="button" onClick={() => setDraft({ ...draft, revision: state.revision })}>已核对，继续编辑</button></div>}
      <footer><button type="button" disabled={busy} onClick={() => { askLeave(() => { setDraft(null); setDirty(false); }); }}>取消</button><button className="signal-primary" disabled={busy || !draft.title.trim() || !draft.tag.trim() || !draft.date || draft.revision !== state.revision}>{busy ? '正在保存…' : '保存并放送 →'}</button></footer><small>保存后，将同步到首页与底部公告。</small></form>}
    </div>
    {pendingAction && <DiscardSignalDialog onKeep={() => setPendingAction(null)} onDiscard={() => { pendingAction(); setPendingAction(null); }} />}
  </section>;
}

export function GoalRadar({ signals, today, onOpen }: { signals: Signals; today: string; onOpen: () => void }) {
  const [expanded, setExpanded] = useState(false);
  const goals = signals.state.goals;
  return <section className="goal-radar" aria-label="目标雷达"><header><div><small>KEEP YOUR FUTURE IN SIGHT</small><h2>目标雷达 <span>{String(goals.length).padStart(2, '0')}</span></h2></div><button onClick={onOpen}>前往心愿放送室 ↗</button></header>{signals.error ? <p role="status">目标暂时无法同步，请到放送室重试。</p> : !signals.ready ? <p>正在读取目标…</p> : !goals.length ? <p>还没有设定远方坐标。为自己写下一个想抵达的目标吧。</p> : <div className="goal-radar-grid">{goals.slice(0, expanded ? undefined : 3).map((goal) => <article key={goal.id}><small>{goal.taskType}</small><h3>{goal.title}</h3><p>{goal.description}</p><footer><time dateTime={goal.date}>{goal.date.replaceAll('-', '.')}</time><strong>{deadline(goal.date, today)}</strong></footer></article>)}</div>}{goals.length > 3 && <button className="goal-radar-expand" onClick={() => setExpanded(!expanded)}>{expanded ? '收起目标 ↑' : `查看全部 ${goals.length} 个目标 ↓`}</button>}</section>;
}

export function SignalTicker({ signals }: { signals: Signals }) {
  const [hidden, setHidden] = useState(false);
  const [paused, setPaused] = useState(false);
  const [duration, setDuration] = useState(60);
  const group = useRef<HTMLDivElement>(null);
  useEffect(() => { const timer = window.setTimeout(() => setHidden(sessionStorage.getItem('sao-signal-hidden') === 'true'), 0); return () => window.clearTimeout(timer); }, []);
  const toggleHidden = (value: boolean) => { setHidden(value); sessionStorage.setItem('sao-signal-hidden', String(value)); };
  const items = [
    ...signals.state.goals.map((item) => `目标 / ${item.taskType} · ${item.title} — ${item.description} · 截止 ${item.date}`),
    ...signals.state.messages.map((item) => `寄语 / ${item.mood} ${item.title} — ${item.description}`),
  ];
  const contentKey = items.join('|');
  useEffect(() => {
    if (!group.current) return;
    const observer = new ResizeObserver(([entry]) => setDuration(Math.max(25, entry.contentRect.width / 55)));
    observer.observe(group.current);
    return () => observer.disconnect();
  }, [contentKey, hidden]);
  if (hidden) return <button className="signal-restore" onClick={() => toggleHidden(false)}>▸ 恢复公告</button>;
  const content = signals.error ? ['信号暂时中断 · 请前往心愿放送室重试'] : !signals.ready ? ['正在接收信号…'] : items.length ? items : ['频率已就绪 · 在心愿放送室写下目标与寄语'];
  return <aside className={`signal-ticker ${paused ? 'is-paused' : ''}`} aria-label="目标与寄语公告"><strong className="signal-ticker-label">ON AIR<small>心愿放送</small></strong><div className="signal-ticker-window" tabIndex={0} aria-label="公告内容，悬停或聚焦暂停；可横向滚动"><div className="signal-ticker-track" style={{ '--ticker-duration': `${duration}s` } as CSSProperties}>{[0, 1].map((copy) => <div className="signal-ticker-group" key={copy} ref={copy === 0 ? group : undefined} aria-hidden={copy === 1 ? true : undefined}>{content.map((text, index) => <span key={index}><b aria-hidden="true">◆</b>{text}</span>)}</div>)}</div></div><button aria-label={paused ? '继续公告滚动' : '暂停公告滚动'} onClick={() => setPaused(!paused)}>{paused ? '▶' : 'Ⅱ'}</button><button aria-label="隐藏公告" title="隐藏公告" onClick={() => toggleHidden(true)}>⌄</button></aside>;
}
