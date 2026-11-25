export default function SubmissionByEmail({ kind }: { kind: "event" | "place" | "food truck" }) {
  return (
    <p className="text-sm leading-relaxed" style={{ color: "var(--app-ink-2)" }}>
      You can email your suggestion to{" "}
      <a className="font-medium underline" href="mailto:hello@frederickradius.app">
        hello@frederickradius.app
      </a>
      . Include {kind === "event" ? "the event name, date, and location" : `the ${kind} name and town`}.
    </p>
  );
}
