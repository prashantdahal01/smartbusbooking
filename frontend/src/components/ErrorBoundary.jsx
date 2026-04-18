import React from "react";

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, errorMessage: "" };
  }

  static getDerivedStateFromError(error) {
    return {
      hasError: true,
      errorMessage: error?.message || "Something went wrong while rendering this page.",
    };
  }

  componentDidCatch(error, info) {
    // eslint-disable-next-line no-console
    console.error("UI render error:", error, info);
  }

  componentDidUpdate(prevProps) {
    if (prevProps.resetKey !== this.props.resetKey && this.state.hasError) {
      this.setState({ hasError: false, errorMessage: "" });
    }
  }

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div className="mx-auto mt-8 max-w-2xl rounded-2xl border border-rose-200 bg-rose-50 p-5 text-rose-700">
        <h2 className="text-lg font-bold">Page failed to render</h2>
        <p className="mt-2 text-sm">{this.state.errorMessage}</p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="mt-4 rounded-lg border border-rose-300 bg-white px-4 py-2 text-sm font-semibold text-rose-700 hover:bg-rose-100"
        >
          Reload page
        </button>
      </div>
    );
  }
}
