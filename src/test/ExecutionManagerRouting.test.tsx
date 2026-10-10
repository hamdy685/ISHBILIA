import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import AppRoutes from '../routes/AppRoutes';

// Mock useAuth for execution_manager
vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 33, name: 'المهندس كريم', email: 'karim@eshbelia.com' },
    isAuthenticated: true,
    isLoading: false,
    hasRole: (role: string) => role === 'execution_manager',
    hasPermission: () => true,
    roles: ['execution_manager'],
    primaryRole: 'execution_manager',
  }),
}));

describe('Execution Manager Route Guard & Access Verification', () => {
  it('allows execution_manager to access /requests without 403 ForbiddenPage', async () => {
    render(
      <MemoryRouter initialEntries={['/requests']}>
        <AppRoutes />
      </MemoryRouter>
    );

    // Verify it does NOT render 403 ForbiddenPage
    expect(screen.queryByText('لا تملك صلاحية الوصول')).not.toBeInTheDocument();
  });

  it('allows execution_manager to access /requests/create without 403 ForbiddenPage', async () => {
    render(
      <MemoryRouter initialEntries={['/requests/create']}>
        <AppRoutes />
      </MemoryRouter>
    );

    // Verify it does NOT render 403 ForbiddenPage
    expect(screen.queryByText('لا تملك صلاحية الوصول')).not.toBeInTheDocument();
  });

  it('allows execution_manager to access /general-manager dashboard without 403 ForbiddenPage', async () => {
    render(
      <MemoryRouter initialEntries={['/general-manager']}>
        <AppRoutes />
      </MemoryRouter>
    );

    // Verify it does NOT render 403 ForbiddenPage
    expect(screen.queryByText('لا تملك صلاحية الوصول')).not.toBeInTheDocument();
  });
});
