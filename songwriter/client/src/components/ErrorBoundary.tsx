import { Component, type ErrorInfo, type ReactNode } from 'react';

type Props = { children: ReactNode };
type State = { error: Error | null };

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Surface to console so it shows up in devtools even on mobile remote debug
    console.error('[ErrorBoundary]', error, info);
  }

  reset = () => {
    this.setState({ error: null });
  };

  reload = () => {
    window.location.reload();
  };

  render() {
    if (this.state.error) {
      return (
        <div className="min-h-screen flex items-center justify-center px-6 py-12 bg-meadow-50">
          <div className="max-w-md w-full bg-white border border-meadow-200 rounded-2xl shadow-sm p-6 text-center">
            <div className="text-4xl mb-3">🌿</div>
            <h1 className="font-serif text-2xl font-bold text-meadow-900 mb-2">
              Something went wrong
            </h1>
            <p className="text-sm text-meadow-700 mb-5">
              The app hit an unexpected error. Your work is safe — it's saved on the server.
            </p>
            <details className="text-left bg-meadow-50 border border-meadow-100 rounded-lg p-3 mb-5 text-xs text-meadow-700 overflow-auto max-h-48">
              <summary className="cursor-pointer font-medium mb-1">Error details</summary>
              <pre className="whitespace-pre-wrap break-words mt-2">
                {this.state.error.message}
                {'\n\n'}
                {this.state.error.stack}
              </pre>
            </details>
            <div className="flex gap-2 justify-center">
              <button
                onClick={this.reset}
                className="px-4 py-2 bg-white border border-meadow-200 rounded-full hover:bg-meadow-100 text-sm font-medium"
              >
                Try again
              </button>
              <button
                onClick={this.reload}
                className="px-4 py-2 bg-meadow-700 text-meadow-50 rounded-full hover:bg-meadow-800 text-sm font-medium"
              >
                Reload the app
              </button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
