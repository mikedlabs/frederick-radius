/**
 * AnimatedSkyGlyph — server-rendered, CSS-animated weather illustration.
 *
 * Replaces the static Lucide icon at the top of WeatherHero with a
 * richer animated treatment. All animation lives in globals.css so this
 * component stays server-only (no JS shipped). One variant per weather
 * family — sun rays rotate, clouds drift, rain falls, snow drifts,
 * thunder flashes, fog gently breathes.
 *
 * Sized via the `size` prop; defaults to 56 (the WeatherHero hero
 * slot). All inner motion is `prefers-reduced-motion` aware via the
 * media-query overrides in globals.css (the keyframes never fire when
 * the user has the OS toggle on).
 */
export type SkyVariant =
  | "Sun"
  | "CloudSun"
  | "Cloud"
  | "CloudRain"
  | "CloudSnow"
  | "CloudLightning"
  | "CloudFog"
  | "Wind";

export default function AnimatedSkyGlyph({
  variant,
  size = 56,
  className = "",
}: {
  variant: SkyVariant;
  size?: number;
  className?: string;
}) {
  const dim = { width: size, height: size };
  return (
    <div
      className={`sky-glyph sky-glyph--${variant.toLowerCase()} ${className}`}
      style={dim}
      aria-hidden
    >
      {/* Sunny variants — rays rotate around a glowing core. */}
      {(variant === "Sun" || variant === "CloudSun") && (
        <>
          <svg viewBox="0 0 100 100" className="sky-rays" aria-hidden>
            {/* 12 rays evenly spaced around the center. */}
            {Array.from({ length: 12 }, (_, i) => {
              const angle = (i * 30) * (Math.PI / 180);
              const x1 = 50 + Math.cos(angle) * 28;
              const y1 = 50 + Math.sin(angle) * 28;
              const x2 = 50 + Math.cos(angle) * 40;
              const y2 = 50 + Math.sin(angle) * 40;
              return (
                <line
                  key={i}
                  x1={x1}
                  y1={y1}
                  x2={x2}
                  y2={y2}
                  stroke="var(--app-accent)"
                  strokeWidth={2.2}
                  strokeLinecap="round"
                />
              );
            })}
          </svg>
          <svg viewBox="0 0 100 100" className="sky-core" aria-hidden>
            <circle cx={50} cy={50} r={20} fill="var(--app-accent)" />
            <circle cx={50} cy={50} r={20} fill="url(#sun-glow)" />
            <defs>
              <radialGradient id="sun-glow" cx={0.45} cy={0.4}>
                <stop offset={0} stopColor="#fff" stopOpacity={0.65} />
                <stop offset={1} stopColor="#fff" stopOpacity={0} />
              </radialGradient>
            </defs>
          </svg>
        </>
      )}

      {/* CloudSun — a small cloud drifts in front of the sun. */}
      {variant === "CloudSun" && (
        <svg viewBox="0 0 100 100" className="sky-cloud sky-cloud--small" aria-hidden>
          <g fill="var(--app-bg-elevated-solid)" stroke="var(--app-ink-3)" strokeWidth={1.5}>
            <circle cx={42} cy={68} r={11} />
            <circle cx={56} cy={62} r={14} />
            <circle cx={70} cy={70} r={10} />
            <rect x={42} y={70} width={28} height={10} rx={5} stroke="none" />
          </g>
        </svg>
      )}

      {/* Cloud-only variants — a full cloud drifts gently. */}
      {(variant === "Cloud" || variant === "CloudRain" || variant === "CloudSnow" || variant === "CloudLightning" || variant === "CloudFog") && (
        <svg viewBox="0 0 100 100" className="sky-cloud" aria-hidden>
          <g
            fill={variant === "CloudFog" ? "var(--app-bg-sunken)" : "var(--app-bg-elevated-solid)"}
            stroke="var(--app-ink-3)"
            strokeWidth={1.5}
          >
            <circle cx={30} cy={55} r={15} />
            <circle cx={52} cy={45} r={20} />
            <circle cx={72} cy={55} r={14} />
            <rect x={28} y={55} width={48} height={14} rx={7} stroke="none" />
          </g>
        </svg>
      )}

      {/* Rain — three droplets falling on a stagger. */}
      {variant === "CloudRain" && (
        <svg viewBox="0 0 100 100" className="sky-drops" aria-hidden>
          {[
            { x: 36, delay: "0s" },
            { x: 52, delay: "0.25s" },
            { x: 68, delay: "0.5s" },
          ].map((d) => (
            <path
              key={d.x}
              d={`M ${d.x} 70 q -3 4 0 8 q 3 -4 0 -8 Z`}
              fill="var(--app-cool)"
              style={{ animationDelay: d.delay }}
              className="sky-drop"
            />
          ))}
        </svg>
      )}

      {/* Snow — three flakes drifting on slow rotation. */}
      {variant === "CloudSnow" && (
        <svg viewBox="0 0 100 100" className="sky-flakes" aria-hidden>
          {[
            { x: 36, delay: "0s" },
            { x: 52, delay: "0.4s" },
            { x: 68, delay: "0.8s" },
          ].map((f) => (
            <g
              key={f.x}
              transform={`translate(${f.x}, 78)`}
              className="sky-flake"
              style={{ animationDelay: f.delay }}
            >
              <line x1={-3} y1={0} x2={3} y2={0} stroke="var(--app-cool)" strokeWidth={1.6} strokeLinecap="round" />
              <line x1={0} y1={-3} x2={0} y2={3} stroke="var(--app-cool)" strokeWidth={1.6} strokeLinecap="round" />
              <line x1={-2} y1={-2} x2={2} y2={2} stroke="var(--app-cool)" strokeWidth={1.6} strokeLinecap="round" />
              <line x1={-2} y1={2} x2={2} y2={-2} stroke="var(--app-cool)" strokeWidth={1.6} strokeLinecap="round" />
            </g>
          ))}
        </svg>
      )}

      {/* Lightning — a bolt that flashes on a long cycle. */}
      {variant === "CloudLightning" && (
        <svg viewBox="0 0 100 100" className="sky-bolt" aria-hidden>
          <path
            d="M 52 60 L 44 78 L 50 78 L 46 92 L 60 72 L 54 72 L 58 60 Z"
            fill="var(--app-accent)"
            stroke="var(--app-warning)"
            strokeWidth={1.2}
            strokeLinejoin="round"
          />
        </svg>
      )}

      {/* Fog — three horizontal lines that gently shift in opacity. */}
      {variant === "CloudFog" && (
        <svg viewBox="0 0 100 100" className="sky-fog" aria-hidden>
          {[72, 80, 88].map((y, i) => (
            <line
              key={y}
              x1={20}
              y1={y}
              x2={80}
              y2={y}
              stroke="var(--app-ink-3)"
              strokeWidth={2.5}
              strokeLinecap="round"
              style={{ animationDelay: `${i * 0.3}s` }}
              className="sky-fog-line"
            />
          ))}
        </svg>
      )}

      {/* Wind — three curved lines sweeping across. */}
      {variant === "Wind" && (
        <svg viewBox="0 0 100 100" className="sky-wind" aria-hidden>
          {[
            { y: 36, delay: "0s" },
            { y: 52, delay: "0.3s" },
            { y: 68, delay: "0.6s" },
          ].map((w) => (
            <path
              key={w.y}
              d={`M 12 ${w.y} q 30 -8 56 0 q 8 2 12 -1`}
              fill="none"
              stroke="var(--app-sage)"
              strokeWidth={3}
              strokeLinecap="round"
              style={{ animationDelay: w.delay }}
              className="sky-wind-line"
            />
          ))}
        </svg>
      )}
    </div>
  );
}
