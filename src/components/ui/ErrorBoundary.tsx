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
        className="mx-auto mt-12 max-w-md space-y-3 border-t px-1 pt-6"
        style={{ borderColor: "var(--app-border)" }}
      >
        <AlertTriangle
          aria-hidden
          className="h-6 w-6"
          strokeWidth={1.5}
          style={{ color: "var(--app-warning)" }}
        />
        <h2 className="font-sans text-xl font-bold tracking-[-0.02em]" style={{ color: "var(--app-ink)" }}>
          Something glitched
        </h2>
        <p className="text-sm leading-relaxed" style={{ color: "var(--app-ink-2)" }}>
          A piece of this page failed to render on your device. The site itself is fine.
        </p>
        <div className="flex flex-wrap gap-2 pt-2">
          <button
            type="button"
            onClick={this.reset}
            className="min-h-11 rounded-[var(--app-radius-md)] border px-4 text-sm font-semibold"
            style={{ borderColor: "var(--app-control-border)", color: "var(--app-ink)", background: "var(--app-bg)" }}
          >
            Try again
          </button>
          <button
            type="button"
            onClick={() => { if (typeof window !== "undefined") window.location.reload(); }}
            className="min-h-11 rounded-[var(--app-radius-md)] px-4 text-sm font-semibold"
            style={{ background: "var(--app-brand-press)", color: "var(--app-on-brand)" }}
          >
            Reload page
          </button>
        </div>
      </div>
    );
  }
}
