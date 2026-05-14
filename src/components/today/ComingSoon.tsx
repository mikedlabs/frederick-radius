export default function ComingSoon({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <section className="pt-2">
      <p className="text-xs font-medium uppercase tracking-[0.08em]" style={{ color: "var(--app-ink-3)" }}>
        Coming soon
      </p>
      <h1 className="mt-1 font-serif text-3xl font-semibold tracking-tight" style={{ color: "var(--app-ink)" }}>
        {title}
      </h1>
      <p className="mt-2 text-[15px] leading-relaxed" style={{ color: "var(--app-ink-2)" }}>
        {description}
      </p>
    </section>
  );
}
