import React from 'react';
import GlobalErrorFallback from './GlobalErrorFallback';

interface AppErrorBoundaryProps {
  children?: React.ReactNode;
  fallback?: (error: Error | null, reset: () => void) => React.ReactNode;
}

interface AppErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class AppErrorBoundary extends React.Component<AppErrorBoundaryProps, AppErrorBoundaryState> {
  public state: AppErrorBoundaryState = { hasError: false, error: null };

  public static getDerivedStateFromError(error: Error): AppErrorBoundaryState {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    console.error('واجهة النظام واجهت خطأ غير متوقع:', error, errorInfo);
  }

  public resetErrorBoundary = (): void => {
    this.setState({ hasError: false, error: null });
  };

  public render(): React.ReactNode {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback(this.state.error, this.resetErrorBoundary);
      }
      return (
        <GlobalErrorFallback
          error={this.state.error}
          resetErrorBoundary={this.resetErrorBoundary}
        />
      );
    }

    return this.props.children;
  }
}

export default AppErrorBoundary;
