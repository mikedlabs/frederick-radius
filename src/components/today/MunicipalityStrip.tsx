import Link from "next/link";
import { MUNICIPALITIES } from "@/data/municipalities";

export default function MunicipalityStrip() {
  return (
    <div className="-mx-4 overflow-x-auto px-4 scrollbar-hide">
      <ul className="flex min-w-max gap-2">
        {MUNICIPALITIES.map((m) => (
          <li key={m.slug}>
            <Link
              href={`/m/${m.slug}`}
              className="block rounded-full border px-3 py-1.5 text-xs font-medium tracking-tight transition-colors hover:bg-[var(--app-bg-sunken)]"
              style={{ borderColor: "var(--app-border)", color: "var(--app-ink-2)" }}
            >
              {m.name}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
