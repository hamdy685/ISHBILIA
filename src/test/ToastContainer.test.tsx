import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ToastContainer from '../components/common/ToastContainer';
import toast from '../utils/toast';

describe('ToastContainer Component & Unified Notifications', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    act(() => {
      toast.dismiss();
    });
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it('renders nothing initially when there are no active toasts', () => {
    const { container } = render(<ToastContainer />);
    expect(container.firstChild).toBeNull();
  });

  it('displays error toast with crimson styling when toast.error is invoked', () => {
    render(<ToastContainer />);

    act(() => {
      toast.error('حدث عطل مؤقت في النظام. يرجى المحاولة بعد قليل.');
    });

    expect(screen.getByText('حدث عطل مؤقت في النظام. يرجى المحاولة بعد قليل.')).toBeInTheDocument();
    expect(screen.getByText('تنبيه خطأ')).toBeInTheDocument();
  });

  it('displays success toast when toast.success is invoked', () => {
    render(<ToastContainer />);

    act(() => {
      toast.success('تم اعتماد أمر الشراء بنجاح');
    });

    expect(screen.getByText('تم اعتماد أمر الشراء بنجاح')).toBeInTheDocument();
    expect(screen.getByText('تم بنجاح')).toBeInTheDocument();
  });

  it('displays warning / conflict toast with amber styling when toast.warning or toast.conflict is invoked', () => {
    render(<ToastContainer />);

    act(() => {
      toast.conflict('تم اعتماد أمر الشراء مسبقاً ولا يمكن إلغاؤه (كود 409)');
    });

    expect(screen.getByText('تم اعتماد أمر الشراء مسبقاً ولا يمكن إلغاؤه (كود 409)')).toBeInTheDocument();
    expect(screen.getByText('تعارض في الإجراء (409)')).toBeInTheDocument();
  });

  it('allows manual dismissal of toast by clicking the close button', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<ToastContainer />);

    act(() => {
      toast.info('رسالة معلوماتية للتجربة', { id: 'test-close-toast' });
    });

    expect(screen.getByText('رسالة معلوماتية للتجربة')).toBeInTheDocument();

    const closeBtn = screen.getByRole('button', { name: 'إغلاق التنبيه' });
    await user.click(closeBtn);

    expect(screen.queryByText('رسالة معلوماتية للتجربة')).not.toBeInTheDocument();
  });

  it('automatically auto-dismisses toast after duration timer expires', () => {
    render(<ToastContainer />);

    act(() => {
      toast.error('خطأ مؤقت سيختفي تلقائياً', { duration: 3000 });
    });

    expect(screen.getByText('خطأ مؤقت سيختفي تلقائياً')).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(3500);
    });

    expect(screen.queryByText('خطأ مؤقت سيختفي تلقائياً')).not.toBeInTheDocument();
  });

  it('executes custom action callback when action button is clicked in toast', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const actionSpy = vi.fn();

    render(<ToastContainer />);

    act(() => {
      toast.warning('تعارض في السجل', {
        action: {
          label: 'إعادة المحاولة',
          onClick: actionSpy,
        },
      });
    });

    const actionBtn = screen.getByRole('button', { name: /إعادة المحاولة/i });
    await user.click(actionBtn);

    expect(actionSpy).toHaveBeenCalled();
    expect(screen.queryByText('تعارض في السجل')).not.toBeInTheDocument();
  });
});
