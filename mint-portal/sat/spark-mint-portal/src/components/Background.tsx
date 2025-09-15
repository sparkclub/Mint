'use client';

type Kind = 'image' | 'video';
type Fit  = 'cover' | 'contain' | 'fill';

export default function Background() {
  const kind = (process.env.NEXT_PUBLIC_BG_KIND || 'image').toLowerCase() as Kind;
  const url = process.env.NEXT_PUBLIC_BG_URL || '/bg.jpg';

  const mediaOpacity = clamp01(Number(process.env.NEXT_PUBLIC_BG_OPACITY ?? '1'));
  const overlay = clamp01(Number(process.env.NEXT_PUBLIC_BG_OVERLAY_OPACITY ?? '0'));

  const fit = (process.env.NEXT_PUBLIC_BG_FIT || 'cover').toLowerCase() as Fit;
  const position = process.env.NEXT_PUBLIC_BG_POSITION || '50% 50%';

  const blurPx = Math.max(0, Number(process.env.NEXT_PUBLIC_BG_BLUR ?? '0'));
  const brightness = clampRange(Number(process.env.NEXT_PUBLIC_BG_BRIGHTNESS ?? '1'), 0, 2);

  const commonStyle: React.CSSProperties = {
    opacity: mediaOpacity,
    objectFit: fit,
    objectPosition: position,
    filter: `blur(${blurPx}px) brightness(${brightness})`,
  };

  return (
    <>
      {kind === 'video' ? (
        <video
          className="fixed inset-0 -z-60 w-full h-full object-cover pointer-events-none"
          autoPlay
          loop
          muted
          playsInline
          preload="auto"
          style={commonStyle}
        >
          <source src={url} />
        </video>
      ) : (
        <img
          src={url}
          alt=""
          className="fixed inset-0 -z-60 w-full h-full object-cover pointer-events-none select-none"
          style={commonStyle}
        />
      )}

      {overlay > 0 && (
        <div
          aria-hidden
          className="fixed inset-0 -z-50 pointer-events-none"
          style={{
            background: `linear-gradient(
              to bottom,
              rgba(0,0,0,${overlay}) 0%,
              rgba(0,0,0,${Math.min(1, overlay + 0.05)}) 40%,
              rgba(0,0,0,${Math.min(1, overlay + 0.15)}) 100%
            )`,
          }}
        />
      )}
    </>
  );
}

function clamp01(n: number) {
  if (!Number.isFinite(n)) return 0;
  return n < 0 ? 0 : n > 1 ? 1 : n;
}
function clampRange(n: number, min:number, max:number){
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, n));
}
