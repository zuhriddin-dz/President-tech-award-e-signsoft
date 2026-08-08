import type { EmailSender } from '../email/email.types.js';

/**
 * Operational alerting — the push half of monitoring.
 *
 * The worker already logged every failure it had. That was not enough: a
 * completion once failed to seal every sixty seconds for twenty minutes and
 * was noticed only because somebody happened to be watching a spinner. Logs
 * are where you look once you already suspect something; an alert is what
 * makes you suspect it.
 *
 * Three properties matter more than richness here:
 *
 * ONLY ON A REAL PROBLEM. Anything that fires on a transient blip gets muted
 * within a week, and a muted alert is worse than none — it reads as coverage
 * that does not exist. Callers raise only after a fault has persisted.
 *
 * NEVER TWICE. A repeating fault must email once, not once per sweep. The
 * cooldown is per key, so a second, different fault still gets through while
 * the first is quiet.
 *
 * NEVER FATAL. Alerting sits inside the reconcile loop, which is the safety
 * net for signed-but-unsealed evidence. A failure to send mail must never stop
 * that loop, so raise() swallows its own errors and reports them to the log.
 */
export const ALERT_COOLDOWN_MS = 60 * 60 * 1000;

export interface AlertLogger {
  warn(obj: Record<string, unknown>, msg: string): void;
  error(obj: Record<string, unknown>, msg: string): void;
}

export class Alerter {
  /** key -> epoch ms of the last send, for the cooldown. */
  private readonly lastSent = new Map<string, number>();

  constructor(
    private readonly sender: EmailSender,
    /** Where alerts go. Null disables sending — they are still logged. */
    private readonly to: string | null,
    private readonly logger: AlertLogger,
    private readonly cooldownMs: number = ALERT_COOLDOWN_MS,
    /** Injected so tests do not sleep. */
    private readonly now: () => number = () => Date.now(),
  ) {}

  /**
   * Raise `key`. Returns whether an email was actually sent, which is what the
   * tests assert on — a caller should not branch on it.
   */
  async raise(key: string, subject: string, detail: string): Promise<boolean> {
    const at = this.now();
    const previous = this.lastSent.get(key);
    if (previous !== undefined && at - previous < this.cooldownMs) return false;

    // Recorded BEFORE the send, not after: if the provider is the thing that
    // is broken, every sweep would otherwise retry and fail again forever.
    this.lastSent.set(key, at);
    this.logger.error({ alert: key }, subject);
    if (!this.to) return false;

    try {
      await this.sender.send({
        to: this.to,
        subject: `[E-SIGNSOFT] ${subject}`,
        text: detail,
        html: `<pre style="font:13px ui-monospace,monospace;white-space:pre-wrap">${escapeHtml(detail)}</pre>`,
      });
      return true;
    } catch (err) {
      this.logger.warn(
        { alert: key, err: (err as Error).message },
        'could not send the alert email',
      );
      return false;
    }
  }

  /** Forget a key, so the next occurrence alerts immediately. */
  clear(key: string): void {
    this.lastSent.delete(key);
  }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * Counts consecutive failures per key and reports when one crosses the
 * threshold. Separate from Alerter because "has this failed enough times to
 * matter?" and "have I already said so?" are different questions, and the
 * first one is what stops a single transient error from waking anyone.
 */
export class FailureStreak {
  private readonly streak = new Map<string, number>();

  constructor(private readonly threshold: number) {}

  /** Record a failure. True exactly on the attempt that reaches the threshold. */
  fail(key: string): boolean {
    const n = (this.streak.get(key) ?? 0) + 1;
    this.streak.set(key, n);
    return n === this.threshold;
  }

  /** Record a success, so a recovered key starts counting again from zero. */
  succeed(key: string): void {
    this.streak.delete(key);
  }

  count(key: string): number {
    return this.streak.get(key) ?? 0;
  }
}
