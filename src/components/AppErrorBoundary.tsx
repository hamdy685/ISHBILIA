import React from 'react';
import GlobalErrorFallback from './GlobalErrorFallback';
import { isChunkLoadError, hasRecentlyReloadedForChunk, markChunkReload } from '../utils/lazyImportWithRetry';

interface AppErrorBoundaryProps {
  children?: React.ReactNode;
  fallback?: (error: Error | null, reset: () => void) => React.ReactNode;
}

interface AppErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  isReloadingChunk: boolean;
}

export class AppErrorBoundary extends React.Component<AppErrorBoundaryProps, AppErrorBoundaryState> {
  public state: AppErrorBoundaryState = { hasError: false, error: null, isReloadingChunk: false };

  public static getDerivedStateFromError(error: Error): AppErrorBoundaryState {
    const isChunk = isChunkLoadError(error);
    const alreadyReloaded = hasRecentlyReloadedForChunk();

    if (isChunk && !alreadyReloaded) {
      markChunkReload();
      setTimeout(() => {
        window.location.reload();
      }, 100);
      return { hasError: true, error, isReloadingChunk: true };
    }

    return { hasError: true, error, isReloadingChunk: false };
  }

  public componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    console.error('واجهة النظام واجهت خطأ:', error, errorInfo);
  }

  public resetErrorBoundary = (): void => {
    this.setState({ hasError: false, error: null, isReloadingChunk: false });
  };

  public render(): React.ReactNode {
    if (this.state.hasError) {
      if (this.state.isReloadingChunk) {
        return (
          <div className="min-h-screen bg-[#0b1220] flex flex-col items-center justify-center p-6 text-slate-100 font-sans" dir="rtl">
            <div className="relative flex items-center justify-center">
              <div className="w-16 h-16 rounded-full border-2 border-gold-500/20 border-t-gold-400 animate-spin" />
              <span className="absolute text-xl select-none">🔄</span>
            </div>
            <h2 className="mt-5 text-base font-black text-gold-300">
              تم تحديث النظام إلى إصدار جديد
            </h2>
            <p className="mt-1.5 text-xs text-slate-400 font-medium animate-pulse">
              جارٍ تحديث الصفحة تلقائياً لتطبيق أحدث التغييرات...
            </p>
          </div>
        );
      }

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

