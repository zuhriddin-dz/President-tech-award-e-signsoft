import { sumFromTiyin } from '@docflow/contracts';

/**
 * Money, as a person reads it: `9_900_000` tiyin becomes `99 000 so'm`.
 *
 * Grouped by hand rather than through `toLocaleString`, on purpose. Intl
 * formats differently depending on the runtime's locale data and inserts a
 * non-breaking (or narrow no-break) space, so the server and the browser can
 * produce two different strings for the same number — which React reports as a
 * hydration mismatch on the one page where the number has to be trustworthy.
 * This is the same characters everywhere, always.
 */
export function formatSum(tiyin: number): string {
  const grouped = String(sumFromTiyin(tiyin)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return `${grouped} so'm`;
}
