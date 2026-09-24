import { Seal } from './seal';

/**
 * The hero's one object: a small stack of contracts LYING on the page, seen
 * from above at an angle — roughly halfway between flat and upright — with our
 * seal pressed into the top sheet and a signature beside it.
 *
 * It is drawn rather than photographed or screenshotted: a picture would cost
 * a network round trip before the first thing anyone looks at, and it could
 * never be re-typed for three languages or re-coloured with the palette.
 *
 * The motion is the whole idea, and the PAPER never moves. At rest the seal
 * and the signature lie flat on the sheet, as ink does. Point at the stack and
 * those two rise off it — they gain height in the same 3D space the paper
 * occupies (`transform-style: preserve-3d` down the whole chain), and their
 * shadows grow with them, so what lifts reads as a physical thing rather than
 * a hover effect. A sheet that tilted as well would just look like a wobble.
 *
 * Nothing here is interactive, so it carries no focus behaviour: the
 * neighbouring buttons are the controls. Under `prefers-reduced-motion` the
 * transitions are dropped by globals.css and everything stays flat.
 */
export function SignedDocument({
  title,
  signatureLabel,
  className = '',
}: {
  /** The document's own title, e.g. "Service agreement". */
  title: string;
  /** Label under the drawn signature, e.g. "Signed by". */
  signatureLabel: string;
  className?: string;
}) {
  return (
    <div className={`group flex justify-center [perspective:1500px] ${className}`} aria-hidden="true">
      {/* The lie of the paper: 44° back from upright, turned 14° in the plane.
          Every sheet and every mark shares this, which is what makes the lift
          read as height rather than scale. */}
      <div className="relative aspect-[1/1.22] w-full max-w-[400px] [transform:rotateX(44deg)_rotateZ(-14deg)] [transform-style:preserve-3d]">
        {/* The sheets underneath — a stack, not a single page. */}
        <div className="absolute inset-0 translate-x-[14px] translate-y-[16px] rounded-[10px] border border-hairline bg-page opacity-60 shadow-[0_10px_20px_rgba(0,0,0,0.05)] [transform:translateZ(-14px)]" />
        <div className="absolute inset-0 translate-x-[7px] translate-y-[8px] rounded-[10px] border border-hairline bg-page opacity-80 shadow-[0_10px_20px_rgba(0,0,0,0.05)] [transform:translateZ(-7px)]" />

        {/* The top sheet. */}
        <div className="absolute inset-0 flex flex-col gap-5 rounded-[10px] border border-hairline bg-page px-8 py-9 shadow-[0_2px_2px_rgba(0,0,0,0.02),0_12px_22px_rgba(0,0,0,0.06),0_36px_60px_rgba(0,0,0,0.08)] [transform-style:preserve-3d]">
          {/* The folded top-right corner — the one detail that says "paper". */}
          <span className="absolute top-0 right-0 h-11 w-11 overflow-hidden rounded-tr-[10px]">
            <span className="absolute inset-0 bg-mist" />
            <span className="absolute -top-px -right-px h-11 w-11 border-b border-l border-hairline bg-page [clip-path:polygon(0_0,100%_100%,0_100%)]" />
          </span>

          <div className="flex flex-col gap-2">
            <p className="font-mono text-[10px] tracking-[0.18em] text-quiet uppercase">
              E-SIGNSOFT
            </p>
            <h3 className="font-display text-2xl leading-none font-semibold tracking-tight text-night">
              {title}
            </h3>
          </div>

          {/* The body of the contract, as rules. Widths vary the way real
              paragraphs do, so it reads as text rather than a pattern. */}
          <div className="flex flex-col gap-2.5 pt-1">
            {[96, 88, 93, 72, 90, 84, 62, 78].map((w, i) => (
              <span
                key={i}
                className="block h-[7px] rounded-full bg-night/[0.085]"
                style={{ width: `${w}%` }}
              />
            ))}
          </div>

          {/* The two marks. Both lie flat on the paper, and both rise when the
              pointer arrives — the signature a little, the seal further, so
              they separate instead of moving as one slab. */}
          <div className="mt-auto flex items-end justify-between gap-4 [transform-style:preserve-3d]">
            <div
              className={
                'flex flex-col gap-1.5 transition-[transform,filter] duration-500 ease-out ' +
                '[transform:translateZ(0px)] drop-shadow-[0_1px_1px_rgba(13,13,13,0.10)] ' +
                'group-hover:[transform:translateZ(34px)] ' +
                'group-hover:drop-shadow-[0_14px_16px_rgba(13,13,13,0.20)]'
              }
            >
              <svg
                width="132"
                height="42"
                viewBox="0 0 132 42"
                fill="none"
                className="text-night"
                focusable="false"
              >
                <path
                  d="M3 31c7-2 10-12 14-20 3-6 5-7 6-2 1 6-2 17-6 23-2 4-4 4-4 1 0-6 8-14 15-17 5-2 8-1 6 3-2 5-8 9-6 12 2 2 7-1 12-6 4-4 7-9 10-8 2 1 0 7 2 9 3 2 9-3 14-8 4-4 7-9 11-8 3 1 1 6 4 8 3 2 9 0 20-6"
                  stroke="currentColor"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              <span className="border-t border-hairline pt-1.5 font-mono text-[10px] tracking-[0.12em] text-quiet uppercase">
                {signatureLabel}
              </span>
            </div>

            <div
              className={
                'relative -mr-3 -mb-1 text-seal transition-[transform,filter] duration-500 ease-out ' +
                '[transform:translateZ(0px)_rotate(-9deg)] ' +
                'drop-shadow-[0_1px_1px_rgba(13,13,13,0.10)] ' +
                'group-hover:[transform:translateZ(72px)_rotate(-4deg)] ' +
                'group-hover:drop-shadow-[0_26px_30px_rgba(13,13,13,0.24)]'
              }
            >
              <Seal size={126} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
