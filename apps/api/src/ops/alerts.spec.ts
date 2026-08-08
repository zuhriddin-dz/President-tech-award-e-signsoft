import { describe, expect, it, vi } from 'vitest';
import { Alerter, FailureStreak } from './alerts.js';
import type { EmailMessage, EmailSender } from '../email/email.types.js';

function harness(opts: { to?: string | null; fails?: boolean } = {}) {
  const sent: EmailMessage[] = [];
  const sender: EmailSender = {
    async send(m) {
      if (opts.fails) throw new Error('provider down');
      sent.push(m);
    },
  };
  const logger = { warn: vi.fn(), error: vi.fn() };
  let clock = 1_000_000;
  const alerter = new Alerter(
    sender,
    opts.to === undefined ? 'ops@esignsoft.uz' : opts.to,
    logger,
    60_000,
    () => clock,
  );
  return { alerter, sent, logger, advance: (ms: number) => (clock += ms) };
}

describe('Alerter', () => {
  it('sends the first time a key is raised', async () => {
    const { alerter, sent } = harness();
    expect(await alerter.raise('stuck', 'Sealing is failing', 'detail')).toBe(true);
    expect(sent).toHaveLength(1);
    expect(sent[0]!.subject).toBe('[E-SIGNSOFT] Sealing is failing');
    expect(sent[0]!.to).toBe('ops@esignsoft.uz');
  });

  // A fault that repeats every sweep must not email every sweep. An alert
  // channel that floods gets muted, and a muted channel reads as coverage
  // that does not exist.
  it('stays quiet for the same key inside the cooldown', async () => {
    const { alerter, sent, advance } = harness();
    await alerter.raise('stuck', 'first', 'x');
    advance(30_000);
    expect(await alerter.raise('stuck', 'second', 'x')).toBe(false);
    advance(31_000);
    expect(await alerter.raise('stuck', 'third', 'x')).toBe(true);
    expect(sent).toHaveLength(2);
  });

  it('lets a DIFFERENT fault through while the first is cooling down', async () => {
    const { alerter, sent } = harness();
    await alerter.raise('stuck-a', 'a', 'x');
    expect(await alerter.raise('stuck-b', 'b', 'x')).toBe(true);
    expect(sent).toHaveLength(2);
  });

  // Alerting runs inside the reconcile loop, which is the safety net for
  // signed-but-unsealed evidence. It must never be the thing that stops it.
  it('never throws when the mail provider is down', async () => {
    const { alerter, logger } = harness({ fails: true });
    await expect(alerter.raise('stuck', 'subject', 'detail')).resolves.toBe(false);
    expect(logger.warn).toHaveBeenCalled();
  });

  it('does not retry forever when the provider is the broken thing', async () => {
    const { alerter, advance } = harness({ fails: true });
    await alerter.raise('stuck', 'a', 'x');
    advance(30_000);
    // Cooldown was recorded despite the failed send, so the next sweep is quiet.
    expect(await alerter.raise('stuck', 'a', 'x')).toBe(false);
  });

  it('still logs when no alert address is configured', async () => {
    const { alerter, sent, logger } = harness({ to: null });
    expect(await alerter.raise('stuck', 'subject', 'detail')).toBe(false);
    expect(sent).toHaveLength(0);
    expect(logger.error).toHaveBeenCalled();
  });

  it('alerts again immediately once a key is cleared', async () => {
    const { alerter } = harness();
    await alerter.raise('stuck', 'a', 'x');
    alerter.clear('stuck');
    expect(await alerter.raise('stuck', 'a', 'x')).toBe(true);
  });
});

describe('FailureStreak', () => {
  it('reports only on the attempt that reaches the threshold', () => {
    const streak = new FailureStreak(3);
    expect(streak.fail('r1')).toBe(false);
    expect(streak.fail('r1')).toBe(false);
    expect(streak.fail('r1')).toBe(true);
    // Past the threshold it stops reporting; the Alerter's cooldown governs.
    expect(streak.fail('r1')).toBe(false);
  });

  it('resets after a success, so a flaky key does not accumulate to an alert', () => {
    const streak = new FailureStreak(3);
    streak.fail('r1');
    streak.fail('r1');
    streak.succeed('r1');
    expect(streak.count('r1')).toBe(0);
    expect(streak.fail('r1')).toBe(false);
  });

  it('counts each key separately', () => {
    const streak = new FailureStreak(2);
    expect(streak.fail('a')).toBe(false);
    expect(streak.fail('b')).toBe(false);
    expect(streak.fail('a')).toBe(true);
  });
});
