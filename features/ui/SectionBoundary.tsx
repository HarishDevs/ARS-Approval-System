"use client";

import { Component } from "react";
import { ErrorState } from "@/features/ui/States";

// FB-02: one failing part of a page (comments, files, history) shows its
// own error and a Try again, instead of breaking the whole page.
export class SectionBoundary extends Component<{ children: React.ReactNode; label: string }, { failed: boolean; key: number }> {
  state = { failed: false, key: 0 };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    if (this.state.failed) {
      return <ErrorState variant="card" title={`${this.props.label} couldn't be shown`} body="The rest of the page is fine. Try again, or reload the page." onRetry={() => this.setState((state) => ({ failed: false, key: state.key + 1 }))} />;
    }
    return <div key={this.state.key}>{this.props.children}</div>;
  }
}
