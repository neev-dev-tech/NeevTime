import React from 'react';
import { AlertTriangle, RefreshCw, Home, X } from 'lucide-react';
import Button from './ui/Button';

class ErrorBoundary extends React.Component {
    constructor(props) {
        super(props);
        this.state = {
            hasError: false,
            error: null,
            errorInfo: null,
            errorId: null
        };
    }

    static getDerivedStateFromError(error) {
        // Generate unique error ID for tracking
        const errorId = `ERR-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        return {
            hasError: true,
            error,
            errorId
        };
    }

    componentDidCatch(error, errorInfo) {
        // Log error to console in development
        if (process.env.NODE_ENV === 'development') {
            console.error('Error Boundary caught an error:', error, errorInfo);
        }

        // In production, you could send this to an error tracking service
        // Example: Sentry.captureException(error, { extra: errorInfo });

        this.setState({
            errorInfo
        });
    }

    handleReset = () => {
        this.setState({
            hasError: false,
            error: null,
            errorInfo: null,
            errorId: null
        });
    };

    handleReload = () => {
        window.location.reload();
    };

    handleGoHome = () => {
        window.location.href = '/';
    };

    render() {
        if (this.state.hasError) {
            const { fallback, showDetails = false } = this.props;
            
            // Custom fallback component
            if (fallback) {
                return fallback(this.state.error, this.handleReset);
            }

            // Default error UI
            return (
                <div className="min-h-screen flex items-center justify-center p-4" style={{ backgroundColor: '#FAFBFC' }}>
                    <div className="max-w-2xl w-full bg-white rounded-xl shadow-lg border border-red-100 overflow-hidden">
                        {/* Header */}
                        <div className="bg-gradient-to-r from-red-50 to-orange-50 px-6 py-4 border-b border-red-100">
                            <div className="flex items-center gap-3">
                                <div className="p-2 bg-red-100 rounded-lg">
                                    <AlertTriangle className="text-red-600" size={24} />
                                </div>
                                <div>
                                    <h1 className="text-xl font-bold text-slate-900">Something went wrong</h1>
                                    <p className="text-sm text-slate-600 mt-1">
                                        Error ID: <span className="font-mono text-xs">{this.state.errorId}</span>
                                    </p>
                                </div>
                            </div>
                        </div>

                        {/* Error Message */}
                        <div className="p-6">
                            <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4">
                                <p className="text-sm font-medium text-red-800">
                                    {this.state.error?.message || 'An unexpected error occurred'}
                                </p>
                            </div>

                            {/* Error Details (Development only) */}
                            {showDetails && process.env.NODE_ENV === 'development' && this.state.errorInfo && (
                                <details className="mt-4">
                                    <summary className="cursor-pointer text-sm font-medium text-slate-700 mb-2">
                                        Technical Details (Development Only)
                                    </summary>
                                    <pre className="bg-slate-50 border border-slate-200 rounded p-3 text-xs overflow-auto max-h-64 font-mono">
                                        {this.state.errorInfo.componentStack}
                                    </pre>
                                </details>
                            )}

                            {/* Actions */}
                            <div className="flex flex-wrap gap-3 mt-6">
                                <Button variant="primary" icon={RefreshCw} onClick={this.handleReset}>
                                    Try Again
                                </Button>
                                <Button variant="secondary" icon={RefreshCw} onClick={this.handleReload}>
                                    Reload Page
                                </Button>
                                <Button variant="secondary" icon={Home} onClick={this.handleGoHome}>
                                    Go Home
                                </Button>
                            </div>

                            {/* Help Text */}
                            <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                                <p className="text-sm text-blue-800">
                                    <strong>Need help?</strong> If this error persists, please contact support with the Error ID above.
                                </p>
                            </div>
                        </div>
                    </div>
                </div>
            );
        }

        return this.props.children;
    }
}

export default ErrorBoundary;

