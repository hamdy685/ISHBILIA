import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import QuickLauncherBar from '../components/dashboard/QuickLauncherBar';

// Mock useAuth
vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 1, name: 'المدير العام', email: 'gm@ashbiliya.com' },
    hasRole: (role: string) => role === 'general_manager',
    hasPermission: () => true,
    roles: ['general_manager'],
  }),
}));

describe('Issue 3: Purchase Order Action Buttons & Read-Only Verification', () => {
  it('QuickLauncherBar for General Manager shows issued PO link without approval text', () => {
    render(
      <BrowserRouter>
        <QuickLauncherBar />
      </BrowserRouter>
    );

    // Verify GM sees "أوامر الشراء الصادرة"
    expect(screen.getByText('أوامر الشراء الصادرة')).toBeInTheDocument();
    // Verify GM does NOT see the invalid "اعتماد أوامر الشراء"
    expect(screen.queryByText('اعتماد أوامر الشراء')).not.toBeInTheDocument();
  });
});
