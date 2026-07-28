'use client';

import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { Check, ChevronDown, Search, X } from 'lucide-react';

/**
 * The interactive shells: dropdown menus, modals, search and filter controls.
 * Kept apart from primitives.tsx so server components can import the static
 * vocabulary without dragging the whole client bundle along.
 */

// ── Dropdown ───────────────────────────────────────────────────────────────

/**
 * Click-to-open popover anchored to a trigger. Closes on outside click, on
 * Escape, and after any item is chosen (menus that stay open after a
 * destructive click are how people delete the wrong row).
 */
export function Dropdown({
  trigger,
  children,
  align = 'start',
  className = '',
  menuClassName = '',
}: {
  trigger: (open: boolean) => ReactNode;
  children: ReactNode | ((close: () => void) => ReactNode);
  align?: 'start' | 'end';
  className?: string;
  menuClassName?: string;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onPointer(e: MouseEvent) {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const close = () => setOpen(false);

  return (
    <div ref={root} className={`relative ${className}`}>
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center outline-none focus-visible:ring-2 focus-visible:ring-brand rounded-md"
      >
        {trigger(open)}
      </button>
      {open && (
        <div
          role="menu"
          onClick={close}
          className={
            'absolute z-40 mt-1 min-w-52 overflow-hidden rounded-lg border border-border bg-surface py-1 shadow-xl ' +
            (align === 'end' ? 'right-0 ' : 'left-0 ') +
            menuClassName
          }
        >
          {typeof children === 'function' ? children(close) : children}
        </div>
      )}
    </div>
  );
}

export function MenuItem({
  children,
  onClick,
  href,
  danger = false,
  selected = false,
  icon,
  disabled = false,
}: {
  children: ReactNode;
  onClick?: () => void;
  href?: string;
  danger?: boolean;
  selected?: boolean;
  icon?: ReactNode;
  disabled?: boolean;
}) {
  const cls =
    'flex w-full items-center gap-2.5 px-4 py-2.5 text-left text-sm transition-colors ' +
    (disabled
      ? 'cursor-not-allowed text-ink-faint '
      : danger
        ? 'text-danger hover:bg-danger-soft '
        : 'text-ink hover:bg-surface-sunken ');
  const body = (
    <>
      {icon}
      <span className="flex-1 truncate">{children}</span>
      {selected && <Check className="h-4 w-4 text-brand" />}
    </>
  );
  if (href && !disabled)
    return (
      <a role="menuitem" href={href} className={cls}>
        {body}
      </a>
    );
  return (
    <button role="menuitem" type="button" disabled={disabled} onClick={onClick} className={cls}>
      {body}
    </button>
  );
}

export function MenuDivider() {
  return <div className="my-1 border-t border-border" />;
}

// ── Modal ──────────────────────────────────────────────────────────────────

/**
 * Centred dialog. `size` full is the template picker / tagging overlays that
 * take over the screen; the rest are ordinary confirm-and-go dialogs.
 */
export function Modal({
  title,
  onClose,
  children,
  footer,
  size = 'md',
  hideHeaderBorder = false,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'full';
  hideHeaderBorder?: boolean;
}) {
  const labelId = useId();
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  const width = {
    sm: 'max-w-md',
    md: 'max-w-2xl',
    lg: 'max-w-4xl',
    full: 'max-w-none w-[min(1400px,96vw)] h-[92vh]',
  }[size];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/45 p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelId}
        className={`flex w-full ${width} max-h-[92vh] flex-col overflow-hidden rounded-xl bg-surface shadow-2xl`}
      >
        <div
          className={`flex shrink-0 items-center justify-between px-7 py-5 ${
            hideHeaderBorder ? '' : 'border-b border-border'
          }`}
        >
          <h2 id={labelId} className="text-2xl font-semibold text-ink">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-md p-1.5 text-ink-muted transition-colors hover:bg-surface-sunken hover:text-ink"
          >
            <X className="h-6 w-6" />
          </button>
        </div>
        <div className="thin-scroll min-h-0 flex-1 overflow-y-auto">{children}</div>
        {footer && (
          <div className="flex shrink-0 items-center justify-end gap-3 border-t border-border px-7 py-4">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Inputs ─────────────────────────────────────────────────────────────────

export function SearchInput({
  value,
  onChange,
  placeholder,
  className = '',
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  className?: string;
}) {
  return (
    <div className={`relative ${className}`}>
      <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-ink-muted" />
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="h-11 w-full rounded-md border border-border-strong bg-surface pr-3 pl-9 text-sm text-ink outline-none placeholder:text-ink-muted focus:border-brand focus:ring-1 focus:ring-brand"
      />
    </div>
  );
}

export function TextField({
  label,
  value,
  onChange,
  placeholder,
  required = false,
  type = 'text',
  maxLength,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  required?: boolean;
  type?: string;
  maxLength?: number;
}) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium text-ink">
        {label}
        {required && <span className="ml-0.5 text-danger">*</span>}
      </label>
      <input
        id={id}
        type={type}
        value={value}
        maxLength={maxLength}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="h-11 w-full rounded-md border border-border-strong bg-surface px-3 text-sm text-ink outline-none placeholder:text-ink-muted focus:border-brand focus:ring-1 focus:ring-brand"
      />
    </div>
  );
}

/** Filter pill with a clear affordance — "Date: Last 6 Months ✕". */
export function FilterChip({ label, onClear }: { label: string; onClear?: () => void }) {
  return (
    <span className="inline-flex h-11 items-center gap-2 rounded-md border border-border-strong bg-surface px-3 text-sm text-ink">
      {label}
      {onClear && (
        <button
          type="button"
          onClick={onClear}
          aria-label={`Clear ${label}`}
          className="text-ink-muted hover:text-ink"
        >
          <X className="h-4 w-4" />
        </button>
      )}
    </span>
  );
}

/** Select-looking dropdown trigger used across the filter bars. */
export function SelectChip({ label, open }: { label: string; open: boolean }) {
  return (
    <span
      className={`inline-flex h-11 items-center gap-2 rounded-md border bg-surface px-3 text-sm text-ink ${
        open ? 'border-brand' : 'border-border-strong'
      }`}
    >
      {label}
      <ChevronDown className={`h-4 w-4 text-ink-muted transition-transform ${open ? 'rotate-180' : ''}`} />
    </span>
  );
}

export function Checkbox({
  checked,
  indeterminate = false,
  onChange,
  label,
}: {
  checked: boolean;
  indeterminate?: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = indeterminate && !checked;
  }, [indeterminate, checked]);
  return (
    <input
      ref={ref}
      type="checkbox"
      aria-label={label}
      checked={checked}
      onChange={(e) => onChange(e.target.checked)}
      className="h-4 w-4 shrink-0 cursor-pointer accent-brand"
    />
  );
}
