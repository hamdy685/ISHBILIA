import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { GlobalErrorFallback } from '../components/GlobalErrorFallback';
import { AppErrorBoundary } from '../components/AppErrorBoundary';

describe('Error Boundaries: GlobalErrorFallback & AppErrorBoundary', () => {
  it('renders GlobalErrorFallback with luxury message and action buttons', () => {
    const resetMock = vi.fn();
    const testError = new Error('Test crash in component');

    render(<GlobalErrorFallback error={testError} resetErrorBoundary={resetMock} />);

    expect(screen.getByText(/واجهة النظام واجهت حالة غير متوقعة/i)).toBeInTheDocument();
    expect(screen.getByText(/لحماية الجلسة والبيانات التشغيلية/i)).toBeInTheDocument();

    const reloadBtn = screen.getByRole('button', { name: /إعادة تحميل الصفحة/i });
    expect(reloadBtn).toBeInTheDocument();
    fireEvent.click(reloadBtn);
    expect(resetMock).toHaveBeenCalledTimes(1);
  });

  it('toggles diagnostic details in GlobalErrorFallback', () => {
    const testError = new Error('Explicit diagnostic error details');
    render(<GlobalErrorFallback error={testError} />);

    // Toggle button exists
    const toggleBtn = screen.getByText(/عرض التفاصيل الفنية للخطأ/i);
    expect(toggleBtn).toBeInTheDocument();

    // Click toggle to view details
    fireEvent.click(toggleBtn);
    expect(screen.getAllByText(/Explicit diagnostic error details/i).length).toBeGreaterThanOrEqual(1);
  });

  it('renders children when AppErrorBoundary has no error', () => {
    render(
      <AppErrorBoundary>
        <div data-testid="safe-child">محتوى آمن</div>
      </AppErrorBoundary>
    );

    expect(screen.getByTestId('safe-child')).toBeInTheDocument();
  });
});
