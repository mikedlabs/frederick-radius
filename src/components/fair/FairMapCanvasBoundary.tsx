"use client";

import { Component, type ReactNode } from "react";

type FairMapCanvasBoundaryProps = {
  children: ReactNode;
  fallback: ReactNode;
  captureFocus: () => boolean;
  onFailure: (error: Error, context: { focusWasInside: boolean }) => void;
};

type FairMapCanvasBoundaryState = {
  failed: boolean;
};

export default class FairMapCanvasBoundary extends Component<
  FairMapCanvasBoundaryProps,
  FairMapCanvasBoundaryState
> {
  state: FairMapCanvasBoundaryState = { failed: false };
  private focusWasInsideBeforeFailure = false;

  static getDerivedStateFromError(): FairMapCanvasBoundaryState {
    return { failed: true };
  }

  getSnapshotBeforeUpdate(
    _previousProps: FairMapCanvasBoundaryProps,
    previousState: FairMapCanvasBoundaryState,
  ): null {
    if (!previousState.failed && this.state.failed) {
      this.focusWasInsideBeforeFailure = this.props.captureFocus();
    }
    return null;
  }

  componentDidUpdate() {
    // Focus is captured in getSnapshotBeforeUpdate while the failed map DOM is
    // still mounted. componentDidCatch then forwards it after React commits the
    // local fallback.
  }

  componentDidCatch(error: Error) {
    this.props.onFailure(error, {
      focusWasInside: this.focusWasInsideBeforeFailure,
    });
  }

  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}
