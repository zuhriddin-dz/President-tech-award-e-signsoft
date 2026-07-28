/**
 * The onboarding checklist's shape. Every step is derived from real state
 * (do you have a document, has it been sent, has anyone signed) — a checklist
 * that lies about your progress is worse than no checklist.
 *
 * Rendered inside the nav's checklist pill; see components/shell/top-nav.tsx.
 */
export interface GetStartedStep {
  key: string;
  label: string;
  /** What the user does next, if this step is the one outstanding. */
  cta: string;
  href: string;
  done: boolean;
}
