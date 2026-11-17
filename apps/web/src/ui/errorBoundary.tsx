/*───────────────────── React Error Boundary ─────────────────────*/
/* Isolates rendering errors in individual application sections so a crash
   in one panel (e.g., Booking Reports) does not blank the entire Add-In.
   Does not switch modes, does not trigger Production writes, does not
   expose sensitive internal data. */

import React, { Component, ErrorInfo, ReactNode } from "react";

type ErrorBoundaryState = { hasError: boolean; errorMessage: string } | null;

type ErrorBoundaryProps = {
  children: ReactNode;
  fallbackTitle?: string;
  fallbackMessage?: string;
  onReset?: () => void;
};

type ErrorBoundaryStateType = {
  hasError: boolean;
  errorMessage: string;
};

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryStateType> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, errorMessage: "" };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryStateType {
    return {
      hasError: true,
      errorMessage: error.message ?? "An unexpected error occurred while rendering this section.",
    };
  }

  static getDerivedStateFromProps(props: ErrorBoundaryProps, state: ErrorBoundaryStateType): ErrorBoundaryStateType {
    if (props.onReset && state.hasError) {
      return { hasError: false, errorMessage: "" };
    }
    return state;
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.error("[OPEX-VBM ErrorBoundary]", error.message, errorInfo.componentStack);
  }

  reset = (): void => {
    this.setState({ hasError: false, errorMessage: "" });
    this.props.onReset?.();
  };

  render(): ReactNode {
    if (this.state.hasError) {
      return (
        <div className="panel">
          <div className="panel-head">
            <div className="panel-head-content">
              <h2>{this.props.fallbackTitle ?? "Section Temporarily Unavailable"}</h2>
              <p>{this.props.fallbackMessage ?? this.state.errorMessage}</p>
            </div>
          </div>
          <div className="panel-body" style={{ padding: 24, textAlign: "center" }}>
            <button className="btn btn-primary" onClick={this.reset}>
              Reload This Section
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
