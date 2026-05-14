"use client";

import { Component, type ReactNode } from "react";
import { AlertTriangle } from "lucide-react";

type Props = { children: ReactNode };
type State = { hasError: boolean; error: Error | null };

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error) {
    if (typeof window !== "undefined") {
      // eslint-disable-next-line no-console
      console.error("Frederick Radius caught:", error);
    }
  }

  reset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <div
        role="alert"
        className="mx-auto mt-12 max-w-md space-y-3 rounded-[var(--app-radius-lg)] border bg-[var(--app-bg-elevated)] p-6 text-center"
        style={{ borderColor: "var(--app-border)" }}
      >
        <AlertTriangle
          aria-hidden
          className="mx-auto h-6 w-6"
          strokeWidth={1.5}
          style={{ color: "var(--app-warning)" }}
        />
        <h2 className="font-serif text-xl font-semibold" style={{ color: "var(--app-ink)" }}>
          Something glitched
        </h2>
        <p className="text-sm leading-relaxed" style={{ color: "var(--app-ink-2)" }}>
          A piece of this page failed to render on your device. The site itself is fine.
        </p>
        <div className="flex justify-center gap-2 pt-2">
          <button
            type="button"
            onClick={this.reset}
            className="rounded-full border px-3 py-1.5 text-xs font-medium"
            style={{ borderColor: "var(--app-border)", color: "var(--app-ink)" }}
          >
            Try again
          </button>
          <button
            type="button"
            onClick={() => { if (typeof window !== "undefined") window.location.reload(); }}
            className="rounded-full px-3 py-1.5 text-xs font-medium text-white"
            style={{ background: "var(--app-brand)" }}
          >
            Reload page
          </button>
        </div>
      </div>
    );
  }
}
