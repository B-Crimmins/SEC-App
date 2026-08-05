import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import s from './statements.module.css';

// Click-to-open popover. Positioning: centered above the target when there's
// room, flipped below when near the top of the viewport. No focus trap, no
// portal — the target is kept in place and the panel uses position: fixed.
export default function Popover({ children, content, width = 340 }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ left: 0, top: 0, placement: 'top' });
  const targetRef = useRef(null);
  const panelRef = useRef(null);

  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const t = targetRef.current?.getBoundingClientRect();
      if (!t) return;
      const panelHeight = panelRef.current?.offsetHeight || 0;
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const gap = 8;
      const openAbove = t.top > panelHeight + gap || t.top > vh - t.bottom;
      const left = Math.min(vw - width - 8, Math.max(8, t.left + t.width / 2 - width / 2));
      const top = openAbove ? t.top - panelHeight - gap : t.bottom + gap;
      setPos({ left, top, placement: openAbove ? 'top' : 'bottom' });
    };
    place();
    window.addEventListener('scroll', place, true);
    window.addEventListener('resize', place);
    return () => {
      window.removeEventListener('scroll', place, true);
      window.removeEventListener('resize', place);
    };
  }, [open, width]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e) => {
      if (panelRef.current?.contains(e.target)) return;
      if (targetRef.current?.contains(e.target)) return;
      setOpen(false);
    };
    const onEsc = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onEsc);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onEsc);
    };
  }, [open]);

  return (
    <>
      <span
        ref={targetRef}
        role="button"
        tabIndex={0}
        className={`${s.popTarget} ${open ? s.popOpen : ''}`}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setOpen((o) => !o); }
        }}
      >
        {children}
      </span>
      {open && (
        <div
          ref={panelRef}
          className={s.popPanel}
          style={{ position: 'fixed', left: pos.left, top: pos.top, width, zIndex: 1000 }}
          role="dialog"
        >
          {content}
        </div>
      )}
    </>
  );
}
