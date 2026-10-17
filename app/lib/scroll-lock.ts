// Reference-counted page scroll lock: safe for nested overlays that
// mount/unmount out of order (capture-and-restore would leak locks).
let lockCount = 0;
let savedRootOverflow = '';
let savedBodyOverflow = '';

export function lockScroll() {
  if (lockCount++ === 0) {
    savedRootOverflow = document.documentElement.style.overflow;
    savedBodyOverflow = document.body.style.overflow;
    document.documentElement.style.overflow = 'hidden';
    document.body.style.overflow = 'hidden';
  }
}

export function unlockScroll() {
  if (lockCount === 0 || --lockCount > 0) return;
  document.documentElement.style.overflow = savedRootOverflow;
  document.body.style.overflow = savedBodyOverflow;
}
