import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { contrastRatio, parseHex, rgbDistance, simulate, type Deficiency } from './contrast';

/**
 * The palette's guard rail.
 *
 * These assertions read the ACTUAL token values out of globals.css, so this
 * fails the moment someone "brightens the blue a touch". The brand has only
 * ~4% of headroom over the AA threshold; without a test that margin is
 * invisible to the next person who edits the file.
 */

function tokensFrom(cssPath: string): Record<string, string> {
  const css = readFileSync(cssPath, 'utf8');
  const out: Record<string, string> = {};
  for (const [, name, value] of css.matchAll(/(--color-[a-z0-9-]+):\s*(#[0-9a-fA-F]{3,8});/g)) {
    out[name!] = value!;
  }
  return out;
}

const WEB = tokensFrom(join(__dirname, '..', 'app', 'globals.css'));
const SIGN = tokensFrom(join(__dirname, '..', '..', 'sign', 'app', 'globals.css'));

/** WCAG AA: 4.5 for normal text, 3.0 for large text and UI components. */
const AA_TEXT = 4.5;
const AA_UI = 3.0;

/**
 * Minimum RGB-space separation between any two recipient colours, under any
 * vision type. The chosen set clears 65; this is set just below so an
 * accidental edit fails, but a deliberate re-derivation with slightly
 * different numbers doesn't have to fight the test.
 */
const SEPARATION = 55;

describe('brand palette contrast', () => {
  it('carries white text on every surface that has white text on it', () => {
    const white = WEB['--color-brand-ink']!;
    for (const token of [
      '--color-brand',
      '--color-brand-hover',
      '--color-brand-deep',
      '--color-brand-darkest',
      '--color-hero-from',
      '--color-hero-to',
    ]) {
      const ratio = contrastRatio(white, WEB[token]!);
      expect(ratio, `white on ${token} (${WEB[token]}) = ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(
        AA_TEXT,
      );
    }
  });

  /**
   * The CTA sits ON the hero gradient, and its fill (brand-link) is nearly as
   * dark as the panel — 2.22:1, well under the 3:1 a control needs. What keeps
   * it a distinguishable shape is its hero-glow EDGE, so that is what has to
   * hold: bright enough against the panel behind it, and against the fill it
   * encloses. Sampled along the gradient, not just at its ends, because a
   * gradient can pass at both stops and fail in the middle.
   *
   * A button dissolving into its background is invisible in code review and
   * obvious only to whoever cannot find it.
   */
  it('keeps the hero CTA a distinguishable shape via its edge', () => {
    const edge = WEB['--color-hero-glow']!;
    const fill = WEB['--color-brand-link']!;
    const from = WEB['--color-hero-from']!;
    const to = WEB['--color-hero-to']!;
    const channel = (hex: string, i: number) => parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16);
    const at = (t: number) =>
      `#${[0, 1, 2]
        .map((i) => Math.round(channel(from, i) + (channel(to, i) - channel(from, i)) * t))
        .map((v) => v.toString(16).padStart(2, '0'))
        .join('')}`;

    for (const t of [0, 0.25, 0.5, 0.75, 1]) {
      const ratio = contrastRatio(edge, at(t));
      expect(
        ratio,
        `CTA edge on hero at ${Math.round(t * 100)}% (${at(t)}) = ${ratio.toFixed(2)}:1`,
      ).toBeGreaterThanOrEqual(AA_UI);
    }

    // The edge must also separate from the fill, or it reads as one dark blob.
    const againstFill = contrastRatio(edge, fill);
    expect(againstFill, `CTA edge vs its own fill = ${againstFill.toFixed(2)}:1`).toBeGreaterThanOrEqual(
      AA_UI,
    );

    // And the label still has to be legible on the darker fill.
    const label = contrastRatio(WEB['--color-brand-ink']!, fill);
    expect(label, `CTA label on brand-link = ${label.toFixed(2)}:1`).toBeGreaterThanOrEqual(AA_TEXT);
  });

  it('keeps body text legible on both tinted row backgrounds', () => {
    const ink = WEB['--color-ink']!;
    for (const tint of ['--color-brand-soft', '--color-brand-soft-strong']) {
      const ratio = contrastRatio(ink, WEB[tint]!);
      expect(ratio, `ink on ${tint} = ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(AA_TEXT);
    }
  });

  it('has a link colour that survives BOTH white and a tinted row', () => {
    // This is the whole reason --color-brand-link exists: plain brand on
    // brand-soft is about 4.2:1, which is below AA.
    for (const bg of ['--color-surface', '--color-brand-soft', '--color-brand-soft-strong']) {
      const ratio = contrastRatio(WEB['--color-brand-link']!, WEB[bg]!);
      expect(ratio, `brand-link on ${bg} = ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(AA_TEXT);
    }
  });

  it('keeps secondary text above AA, and marks faint text as metadata-only', () => {
    const white = WEB['--color-surface']!;
    expect(contrastRatio(WEB['--color-ink-muted']!, white)).toBeGreaterThanOrEqual(AA_TEXT);
    // ink-faint deliberately does NOT reach AA. Asserting the fact keeps it
    // honest: if someone "fixes" it they must also revisit where it is used.
    expect(contrastRatio(WEB['--color-ink-faint']!, white)).toBeLessThan(AA_TEXT);
    expect(contrastRatio(WEB['--color-ink-faint']!, white)).toBeGreaterThanOrEqual(AA_UI);
  });

  it('draws every status colour legibly on its own soft background', () => {
    for (const name of ['success', 'warning', 'danger', 'info']) {
      const ratio = contrastRatio(WEB[`--color-${name}`]!, WEB[`--color-${name}-soft`]!);
      expect(ratio, `${name} on ${name}-soft = ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(
        AA_TEXT,
      );
    }
  });
});

describe('recipient field colours', () => {
  const RC = [1, 2, 3, 4, 5, 6].map((n) => WEB[`--color-rc-${n}`]!);

  it('are all visible as outlines on white (WCAG 1.4.11 non-text contrast)', () => {
    for (const [i, hex] of RC.entries()) {
      const ratio = contrastRatio(hex, WEB['--color-surface']!);
      expect(ratio, `rc-${i + 1} (${hex}) on white = ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(
        AA_UI,
      );
    }
  });

  it('never collide with the brand colour', () => {
    // A field tinted brand-blue would read as "selected", not as a recipient.
    const kinds: Deficiency[] = ['protanopia', 'deuteranopia', 'tritanopia'];
    for (const [i, hex] of RC.entries()) {
      for (const kind of kinds) {
        const distance = rgbDistance(simulate(hex, kind), simulate(WEB['--color-brand']!, kind));
        expect(distance, `rc-${i + 1} (${hex}) vs brand under ${kind}`).toBeGreaterThan(SEPARATION);
      }
    }
  });

  it('stay distinguishable from each other under colour-vision deficiency', () => {
    const kinds: Deficiency[] = ['protanopia', 'deuteranopia', 'tritanopia'];
    for (const kind of kinds) {
      for (let i = 0; i < RC.length; i++) {
        for (let j = i + 1; j < RC.length; j++) {
          const distance = rgbDistance(simulate(RC[i]!, kind), simulate(RC[j]!, kind));
          expect(
            distance,
            `rc-${i + 1} (${RC[i]}) vs rc-${j + 1} (${RC[j]}) under ${kind}`,
          ).toBeGreaterThan(SEPARATION);
        }
      }
    }
  });

  it('stay distinguishable to normal vision too', () => {
    // A set can be CVD-safe and still look monotonous to everyone else —
    // optimising only for deficiency simulations is how that happens.
    for (let i = 0; i < RC.length; i++) {
      for (let j = i + 1; j < RC.length; j++) {
        const distance = rgbDistance(parseHex(RC[i]!), parseHex(RC[j]!));
        expect(distance, `rc-${i + 1} vs rc-${j + 1} in normal vision`).toBeGreaterThan(SEPARATION);
      }
    }
  });
});

describe('the two apps agree on the brand', () => {
  it('shares every token they both define', () => {
    const shared = Object.keys(SIGN).filter((k) => k in WEB);
    expect(shared.length).toBeGreaterThan(10);
    for (const token of shared) {
      expect(SIGN[token], `${token} differs between web and sign`).toBe(WEB[token]);
    }
  });

  it('keeps the signing app’s action highlight clear of the brand', () => {
    // Amber marks "this field needs you". If it drifted toward blue the one
    // signal a stranger relies on would blend into the chrome.
    const distance = rgbDistance(
      simulate(SIGN['--color-action']!, 'deuteranopia'),
      simulate(SIGN['--color-brand']!, 'deuteranopia'),
    );
    expect(distance).toBeGreaterThan(80);
  });
});
