import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
    children?: ReactNode;
    fallback?: ReactNode;
    /** When any of these change after an error, the boundary tries to render its children again. */
    resetKeys?: unknown[];
}

interface State {
    hasError: boolean;
    error?: Error;
}

const keysChanged = (a: unknown[] = [], b: unknown[] = []) =>
    a.length !== b.length || a.some((item, i) => !Object.is(item, b[i]));

export class ErrorBoundary extends Component<Props, State> {
    public state: State = {
        hasError: false
    };

    public static getDerivedStateFromError(error: Error): State {
        return { hasError: true, error };
    }

    public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
        console.error('Uncaught error:', error, errorInfo);
    }

    public componentDidUpdate(prevProps: Props) {
        // Fixing the cell content (or re-running it) must bring the cell back
        if (this.state.hasError && keysChanged(prevProps.resetKeys, this.props.resetKeys)) {
            this.setState({ hasError: false, error: undefined });
        }
    }

    public render() {
        if (this.state.hasError) {
            if (this.props.fallback) {
                return this.props.fallback;
            }
            return (
                <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-red-600" role="alert">
                    <h3 className="font-bold">Something went wrong.</h3>
                    <pre className="text-xs mt-2 overflow-auto bg-white p-2 border rounded">
                        {this.state.error?.toString()}
                    </pre>
                    <button
                        className="mt-2 text-xs font-bold underline"
                        onClick={() => this.setState({ hasError: false, error: undefined })}
                    >
                        Try again
                    </button>
                </div>
            );
        }

        return this.props.children;
    }
}
