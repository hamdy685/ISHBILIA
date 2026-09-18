import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { NetworkStatusToast } from '../components/common/NetworkStatusToast';
import { useNetworkStatus } from '../hooks/useNetworkStatus';

function TestHookComponent() {
  const { isOnline, wasOffline } = useNetworkStatus();
  return (
    <div>
      <span data-testid="status">{isOnline ? 'ONLINE' : 'OFFLINE'}</span>
      <span data-testid="was-offline">{wasOffline ? 'WAS_OFFLINE' : 'NEVER_OFFLINE'}</span>
    </div>
  );
}

describe('Network Resilience: useNetworkStatus & NetworkStatusToast', () => {
  it('detects online and offline transitions', () => {
    render(<TestHookComponent />);
    expect(screen.getByTestId('status').textContent).toBe('ONLINE');

    act(() => {
      window.dispatchEvent(new Event('offline'));
    });
    expect(screen.getByTestId('status').textContent).toBe('OFFLINE');
    expect(screen.getByTestId('was-offline').textContent).toBe('WAS_OFFLINE');

    act(() => {
      window.dispatchEvent(new Event('online'));
    });
    expect(screen.getByTestId('status').textContent).toBe('ONLINE');
    expect(screen.getByTestId('was-offline').textContent).toBe('WAS_OFFLINE');
  });

  it('renders offline warning banner when browser goes offline', () => {
    render(<NetworkStatusToast />);

    // Initially online, toast is not visible
    expect(screen.queryByText(/انقطع الاتصال بالإنترنت/i)).toBeNull();

    // Trigger offline
    act(() => {
      window.dispatchEvent(new Event('offline'));
    });

    // Offline toast is now visible
    expect(screen.getByText(/انقطع الاتصال بالإنترنت/i)).toBeInTheDocument();
    expect(screen.getByText(/البيانات المدخلة في النموذج محفوظة تلقائياً/i)).toBeInTheDocument();

    // Trigger back online
    act(() => {
      window.dispatchEvent(new Event('online'));
    });

    // Reconnected banner is now visible
    expect(screen.getByText(/تمت استعادة الاتصال بالإنترنت بنجاح/i)).toBeInTheDocument();
  });
});
