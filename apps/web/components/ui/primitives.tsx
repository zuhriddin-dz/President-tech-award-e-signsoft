import type { ButtonHTMLAttributes, HTMLAttributes } from 'react';

// Minimal white-theme primitives on the semantic tokens from globals.css.
// Kept tiny and local; swap for shadcn if the design grows.

export function Button({
  variant = 'primary',
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'ghost' | 'danger' }) {
  const styles = {
    primary: 'bg-brand text-brand-ink hover:opacity-90',
    ghost: 'bg-surface text-ink border border-border hover:bg-surface-muted',
    danger: 'bg-surface text-danger border border-border hover:bg-surface-muted',
  }[variant];
  return (
    <button
      className={`inline-flex items-center justify-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition disabled:opacity-50 ${styles} ${className}`}
      {...props}
    />
  );
}

export function Card({ className = '', ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={`rounded-lg border border-border bg-surface ${className}`}
      {...props}
    />
  );
}
