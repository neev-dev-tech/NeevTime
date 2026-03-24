import React from 'react';
import { Alert, Button, Box, Typography } from '@mui/material';
import { RefreshCw, AlertTriangle } from 'lucide-react';

/**
 * Error Boundary for Reports Module
 * Catches and displays errors gracefully without crashing the app
 */
class ReportErrorBoundary extends React.Component {
    constructor(props) {
        super(props);
        this.state = { 
            hasError: false, 
            error: null,
            errorInfo: null
        };
    }

    static getDerivedStateFromError(error) {
        return { hasError: true, error };
    }

    componentDidCatch(error, errorInfo) {
        console.error('Report Error Boundary Caught:', error, errorInfo);
        this.setState({ errorInfo });
    }

    handleReset = () => {
        this.setState({ hasError: false, error: null, errorInfo: null });
    };

    handleReload = () => {
        window.location.reload();
    };

    render() {
        if (this.state.hasError) {
            return (
                <Box sx={{ p: 4, maxWidth: 800, mx: 'auto', textAlign: 'center' }}>
                    <Box sx={{ mb: 3 }}>
                        <AlertTriangle size={64} color="#DC2626" />
                    </Box>
                    
                    <Typography variant="h4" gutterBottom sx={{ fontWeight: 700, color: '#1E293B' }}>
                        Report Generation Failed
                    </Typography>
                    
                    <Alert severity="error" sx={{ mb: 3, textAlign: 'left' }}>
                        <Typography variant="body1" sx={{ mb: 1, fontWeight: 600 }}>
                            Error Details:
                        </Typography>
                        <Typography variant="body2" sx={{ fontFamily: 'monospace', fontSize: '0.875rem' }}>
                            {this.state.error?.message || 'An unexpected error occurred'}
                        </Typography>
                    </Alert>

                    <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
                        This could be due to:
                    </Typography>
                    
                    <Box sx={{ textAlign: 'left', maxWidth: 500, mx: 'auto', mb: 3 }}>
                        <ul style={{ color: '#64748B' }}>
                            <li>Dataset too large for browser memory</li>
                            <li>Invalid data format in the report</li>
                            <li>Network connection issues</li>
                            <li>Browser compatibility issues</li>
                        </ul>
                    </Box>

                    <Box sx={{ display: 'flex', gap: 2, justifyContent: 'center' }}>
                        <Button
                            variant="outlined"
                            startIcon={<RefreshCw size={16} />}
                            onClick={this.handleReset}
                        >
                            Try Again
                        </Button>
                        <Button
                            variant="contained"
                            startIcon={<RefreshCw size={16} />}
                            onClick={this.handleReload}
                        >
                            Reload Page
                        </Button>
                    </Box>

                    {process.env.NODE_ENV === 'development' && this.state.errorInfo && (
                        <Box sx={{ mt: 4, p: 2, bgcolor: '#F8FAFC', borderRadius: 2, textAlign: 'left' }}>
                            <Typography variant="caption" sx={{ fontFamily: 'monospace', fontSize: '0.75rem' }}>
                                <strong>Stack Trace (Dev Only):</strong>
                                <pre style={{ overflow: 'auto', maxHeight: 200 }}>
                                    {this.state.errorInfo.componentStack}
                                </pre>
                            </Typography>
                        </Box>
                    )}
                </Box>
            );
        }

        return this.props.children;
    }
}

export default ReportErrorBoundary;
