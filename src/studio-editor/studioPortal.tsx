import { useEffect } from 'react';
import { createPortal } from 'react-dom';

/**
 * Render studio dialogs on document.body so position:fixed is viewport-relative.
 * (Dashboard/shell ancestors with transform/will-change otherwise trap modals
 * inside the Storefront pane and mis-align Publish / logo / template UI.)
 */
export function StudioPortal({
  children,
  lockScroll = true,
}: {
  children: React.ReactNode;
  /** When false (e.g. toast), do not freeze document scroll. */
  lockScroll?: boolean;
}) {
  useEffect(() => {
    if (!lockScroll) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [lockScroll]);

  if (typeof document === 'undefined') return null;
  return createPortal(
    <div className="embedded-studio oxs-studio-overlay" data-oxs-overlay="1">
      {children}
    </div>,
    document.body,
  );
}
