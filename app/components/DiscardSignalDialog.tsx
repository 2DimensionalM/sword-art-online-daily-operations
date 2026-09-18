'use client';

import { useEffect, useRef } from 'react';

export function DiscardSignalDialog({ onKeep, onDiscard }: { onKeep: () => void; onDiscard: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => { const element = dialog.current; element?.showModal(); return () => element?.close(); }, []);
  return <dialog ref={dialog} className="signal-discard-dialog" aria-labelledby="signal-discard-title" onCancel={(event) => { event.preventDefault(); onKeep(); }}>
    <small>UNSAVED SIGNAL</small><h2 id="signal-discard-title">这段信号还没有保存。</h2><p>离开会放弃当前草稿，已保存的目标与寄语不受影响。</p><footer><button autoFocus onClick={onKeep}>继续编辑</button><button onClick={onDiscard}>放弃草稿并继续 →</button></footer>
  </dialog>;
}
