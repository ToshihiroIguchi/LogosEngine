import React, { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
    children?: ReactNode;
    fallback?: ReactNode;
}

interface State {
    hasError: boolean;
    error?: Error;
}

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

    public render() {
        if (this.state.hasError) {
            if (this.props.fallback) {
                return this.props.fallback;
            }
            return (
                <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-red-600">
                    <h3 className="font-bold">Something went wrong.</h3>
                    <pre className="text-xs mt-2 overflow-auto bg-white p-2 border rounded">
                        {this.state.error?.toString()}
                    </pre>
                </div>
            );
        }

        return this.props.children;
    }
}
