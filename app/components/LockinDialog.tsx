'use client';

import { useEffect, useRef, type ReactNode } from 'react';

export function LockinDialog({ title, label, onClose, children }: { title: string; label: string; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dialog?.showModal();
    return () => { dialog?.close(); previous?.focus(); };
  }, []);
  return <dialog ref={ref} className="lockin-dialog" aria-labelledby="lockin-dialog-title" onCancel={(event) => { event.preventDefault(); onClose(); }} onPointerDown={(event) => {
    if (event.target !== event.currentTarget) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    if (event.clientX < bounds.left || event.clientX >= bounds.right || event.clientY < bounds.top || event.clientY >= bounds.bottom) onClose();
  }}>
    <header><span>{label}</span><button aria-label="关闭窗口" onClick={onClose}>×</button></header>
    <h2 id="lockin-dialog-title">{title}</h2>
    {children}
  </dialog>;
}
