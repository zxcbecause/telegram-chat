import { motion } from 'framer-motion';
import { useEffect, useRef, type ReactNode } from 'react';

export interface MenuItem {
  label: string;
  icon?: ReactNode;
  danger?: boolean;
  onSelect: () => void;
}

interface Props {
  items: MenuItem[];
  /** Optional line above the items (e.g. a confirmation question). */
  title?: string;
  className?: string;
  onClose: () => void;
}

/** Small popover menu. Closes on outside click, Escape, or after a choice. */
export function ActionMenu({ items, title, className = '', onClose }: Props) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    // Next tick, so the click that opened the menu doesn't close it.
    const t = setTimeout(() => document.addEventListener('pointerdown', onDown));
    document.addEventListener('keydown', onKey);
    ref.current?.querySelector('button')?.focus();
    return () => {
      clearTimeout(t);
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  return (
    <motion.div
      ref={ref}
      className={`menu ${className}`}
      role="menu"
      initial={{ opacity: 0, scale: 0.92, y: -4 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{ duration: 0.14, ease: 'easeOut' }}
    >
      {title && <div className="menu__title">{title}</div>}
      {items.map((item) => (
        <button
          key={item.label}
          type="button"
          role="menuitem"
          className={`menu__item ${item.danger ? 'menu__item--danger' : ''}`}
          onClick={() => {
            onClose();
            item.onSelect();
          }}
        >
          {item.icon}
          {item.label}
        </button>
      ))}
    </motion.div>
  );
}
