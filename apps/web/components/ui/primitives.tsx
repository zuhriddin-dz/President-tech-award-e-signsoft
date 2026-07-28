import type { AnchorHTMLAttributes, ButtonHTMLAttributes, HTMLAttributes, ReactNode } from 'react';

/**
 * The DocFlow component vocabulary. Everything here is presentational and
 * server-safe (no hooks, no handlers of its own) — the interactive shells
 * live in ./overlays.tsx.
 *
 * Rule: components consume semantic tokens from globals.css. If you find
 * yourself typing a hex here, the token is missing — add it there instead.
 * The ratios those tokens depend on are asserted in lib/contrast.spec.ts.
 */

// ── Buttons ────────────────────────────────────────────────────────────────

export type ButtonVariant = 'primary' | 'secondary' | 'dark' | 'ghost' | 'danger' | 'link';
export type ButtonSize = 'sm' | 'md' | 'lg';

const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
  primary: 'bg-brand text-brand-ink hover:bg-brand-hover shadow-sm',
  secondary: 'bg-surface text-brand border border-brand hover:bg-brand-soft',
  dark: 'bg-brand-deep text-brand-ink hover:bg-brand-darkest shadow-sm',
  ghost: 'bg-transparent text-ink hover:bg-surface-sunken',
  danger: 'bg-surface text-danger border border-danger hover:bg-danger-soft',
  link: 'bg-transparent text-brand-link hover:underline underline-offset-2 px-0',
};

const BUTTON_SIZES: Record<ButtonSize, string> = {
  sm: 'h-8 px-3 text-[13px] gap-1.5',
  md: 'h-10 px-4 text-sm gap-2',
  lg: 'h-12 px-6 text-[15px] gap-2',
};

export const buttonClass = (
  variant: ButtonVariant = 'primary',
  size: ButtonSize = 'md',
  className = '',
): string =>
  `inline-flex items-center justify-center rounded-md font-semibold transition-colors ` +
  `outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-1 ` +
  `disabled:pointer-events-none disabled:opacity-45 ` +
  `${BUTTON_VARIANTS[variant]} ${BUTTON_SIZES[size]} ${className}`;

export function Button({
  variant = 'primary',
  size = 'md',
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant; size?: ButtonSize }) {
  return <button className={buttonClass(variant, size, className)} {...props} />;
}

/** Same skin as Button, for real navigations (keeps prefetch + middle-click). */
export function LinkButton({
  variant = 'primary',
  size = 'md',
  className = '',
  ...props
}: AnchorHTMLAttributes<HTMLAnchorElement> & { variant?: ButtonVariant; size?: ButtonSize }) {
  return <a className={buttonClass(variant, size, className)} {...props} />;
}

/** Square icon-only control — toolbars, row menus, close buttons. */
export function IconButton({
  className = '',
  label,
  active = false,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { label: string; active?: boolean }) {
  return (
    <button
      aria-label={label}
      title={label}
      className={
        'inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md transition-colors ' +
        'outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:opacity-40 ' +
        (active ? 'bg-brand-soft text-brand-link ' : 'text-ink-muted hover:bg-surface-sunken hover:text-ink ') +
        className
      }
      {...props}
    />
  );
}

// ── Containers ─────────────────────────────────────────────────────────────

export function Card({ className = '', ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={`rounded-lg border border-border bg-surface ${className}`} {...props} />;
}

export function CardHeader({
  title,
  action,
  info,
}: {
  title: string;
  action?: ReactNode;
  info?: string;
}) {
  return (
    <div className="flex items-center justify-between px-6 pt-5 pb-3">
      <h2 className="flex items-center gap-1.5 text-sm font-bold tracking-wide text-ink uppercase">
        {title}
        {info && (
          <span
            title={info}
            className="grid h-4 w-4 place-items-center rounded-full border border-ink-faint text-[10px] font-bold text-ink-faint"
          >
            i
          </span>
        )}
      </h2>
      {action}
    </div>
  );
}

/** The "nothing here" panel. Says what the view is FOR, not just that it is empty. */
export function EmptyState({
  title,
  body,
  action,
  icon,
}: {
  title: string;
  body?: string;
  action?: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-6 py-14 text-center">
      {icon}
      <p className="text-xl font-semibold text-ink">{title}</p>
      {body && <p className="max-w-md text-sm text-ink-muted">{body}</p>}
      {action}
    </div>
  );
}

// ── Status ─────────────────────────────────────────────────────────────────

export type StatusTone = 'success' | 'info' | 'warning' | 'danger' | 'neutral';

const TONE_STYLES: Record<StatusTone, string> = {
  success: 'text-success',
  info: 'text-info',
  warning: 'text-warning',
  danger: 'text-danger',
  neutral: 'text-ink-muted',
};

/** Status with a leading glyph — icon plus word, never colour alone. */
export function StatusChip({
  tone,
  label,
  icon,
}: {
  tone: StatusTone;
  label: string;
  icon?: ReactNode;
}) {
  return (
    <span className={`inline-flex items-center gap-1.5 text-sm font-medium ${TONE_STYLES[tone]}`}>
      {icon}
      {label}
    </span>
  );
}

/** Filled pill — used where a chip has to read as a badge, not a line of text. */
export function Pill({ tone, label }: { tone: StatusTone; label: string }) {
  const styles: Record<StatusTone, string> = {
    success: 'bg-success-soft text-success',
    info: 'bg-info-soft text-info',
    warning: 'bg-warning-soft text-warning',
    danger: 'bg-danger-soft text-danger',
    neutral: 'bg-surface-sunken text-ink-muted',
  };
  return (
    <span className={`rounded-full px-2.5 py-1 text-xs font-semibold capitalize ${styles[tone]}`}>
      {label}
    </span>
  );
}

export function ProgressBar({
  value,
  max = 1,
  className = '',
}: {
  value: number;
  max?: number;
  className?: string;
}) {
  const pct = max <= 0 ? 0 : Math.max(0, Math.min(1, value / max)) * 100;
  return (
    <div
      role="progressbar"
      aria-valuenow={value}
      aria-valuemin={0}
      aria-valuemax={max}
      className={`h-1.5 w-full overflow-hidden rounded-full bg-surface-sunken ${className}`}
    >
      <div className="h-full rounded-full bg-brand transition-[width]" style={{ width: `${pct}%` }} />
    </div>
  );
}

// ── Identity ───────────────────────────────────────────────────────────────

/** Initials avatar. `colorIndex` picks a recipient colour for the tag editor. */
export function Avatar({
  name,
  size = 32,
  colorIndex,
}: {
  name: string;
  size?: number;
  colorIndex?: number;
}) {
  const initials =
    name
      .split(/[\s@._-]+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase() ?? '')
      .join('') || '?';
  const bg =
    colorIndex === undefined ? 'var(--color-brand-deep)' : `var(--color-rc-${(colorIndex % 6) + 1})`;
  return (
    <span
      aria-hidden
      className="grid shrink-0 place-items-center rounded-full font-semibold text-white"
      style={{ width: size, height: size, background: bg, fontSize: Math.round(size * 0.4) }}
    >
      {initials}
    </span>
  );
}

// ── Table ──────────────────────────────────────────────────────────────────

export function Th({ className = '', ...props }: HTMLAttributes<HTMLTableCellElement>) {
  return (
    <th
      className={`px-4 py-3 text-left text-[13px] font-semibold text-ink ${className}`}
      {...props}
    />
  );
}

export function Td({ className = '', ...props }: HTMLAttributes<HTMLTableCellElement>) {
  return <td className={`px-4 py-4 align-middle text-sm text-ink ${className}`} {...props} />;
}
