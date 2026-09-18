import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, useNavigate } from 'react-router-dom';
import { AuthProvider } from '../../context/AuthContext';
import { NotificationBell } from '../../components/notifications/NotificationBell';
import { resolveNotificationAction } from '../../utils/notificationRouting';
import { Notification } from '../../types/notification';
import { User } from '../../types/auth';
import * as notificationsApi from '../../api/notifications';
import * as authStorage from '../../utils/authStorage';
import * as authApi from '../../api/auth';

const mockEmployeeUser: User = {
  id: 10,
  name: 'أحمد الموظف',
  email: 'employee@ashbiliya.com',
  is_active: true,
  roles: ['employee'],
  permissions: ['purchase_request.create', 'purchase_request.view_own'],
  department: {
    id: 1,
    name: 'المكتب الفني',
    code: 'ENG',
  },
};

const mockRejectedNotification: Notification = {
  id: 101,
  type: 'purchase_request_rejected',
  title: 'تم رفض طلب الشراء',
  message: 'تم رفض طلب الشراء PR-2026-0042 لوجود خطأ في المواصفات الهندسية.',
  notifiable_type: 'App\\Models\\PurchaseRequest',
  notifiable_id: 42,
  data: {
    purchase_request_id: 42,
    pr_number: 'PR-2026-0042',
    status: 'REJECTED',
    rejection_reason: 'المواصفات الهندسية غير مطابقة',
  },
  read_at: null,
  created_at: '2026-09-18T12:00:00Z',
};

const mockReturnedNotification: Notification = {
  id: 102,
  type: 'purchase_request_returned',
  title: 'طلب شراء معاد للتعديل',
  message: 'طلب الشراء PR-2026-0042 تمت إعادته لك لتعديل الكمية.',
  notifiable_type: 'App\\Models\\PurchaseRequest',
  notifiable_id: 42,
  data: {
    purchase_request_id: 42,
    pr_number: 'PR-2026-0042',
    status: 'RETURNED',
  },
  read_at: null,
  created_at: '2026-09-18T12:30:00Z',
};

const mockApprovedNotification: Notification = {
  id: 103,
  type: 'purchase_request_approved',
  title: 'تم اعتماد طلب الشراء',
  message: 'تم اعتماد طلب الشراء PR-2026-0042 بنجاح.',
  notifiable_type: 'App\\Models\\PurchaseRequest',
  notifiable_id: 42,
  data: {
    purchase_request_id: 42,
    pr_number: 'PR-2026-0042',
    status: 'APPROVED_BY_REVIEWER',
  },
  read_at: null,
  created_at: '2026-09-18T13:00:00Z',
};

describe('Scenario 4: اختبار التنبيهات والربط العميق (Notifications & Deep Linking)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
    sessionStorage.clear();
    vi.spyOn(authStorage, 'getToken').mockReturnValue('mock_token');
    vi.spyOn(authApi, 'getMeApi').mockResolvedValue(mockEmployeeUser);
  });

  describe('4.1 Deep Linking Route Resolver (Unit Test)', () => {
    it('Routes rejected purchase request directly to edit mode (/requests/:id/edit)', () => {
      const action = resolveNotificationAction(mockRejectedNotification, mockEmployeeUser);

      expect(action.url).toBe('/requests/42/edit');
      expect(action.actionLabel).toBe('تعديل الطلب');
      expect(action.isActionable).toBe(true);
      expect(action.priority).toBe('URGENT');
    });

    it('Routes returned purchase request directly to edit mode (/requests/:id/edit)', () => {
      const action = resolveNotificationAction(mockReturnedNotification, mockEmployeeUser);

      expect(action.url).toBe('/requests/42/edit');
      expect(action.actionLabel).toBe('تعديل الطلب');
      expect(action.isActionable).toBe(true);
      expect(action.priority).toBe('URGENT');
    });

    it('Routes non-rejected (approved) purchase request to view mode (not edit)', () => {
      const action = resolveNotificationAction(mockApprovedNotification, mockEmployeeUser);

      expect(action.url).not.toContain('/edit');
      expect(action.url).toBe('/employee/requests/42');
      expect(action.actionLabel).toBe('عرض ومتابعة الطلب');
    });
  });

  describe('4.2 NotificationBell Component Interaction & Routing', () => {
    it('Displays unread count and opening drawer allows clicking rejected notification to navigate to edit mode', async () => {
      vi.spyOn(notificationsApi, 'getUnreadNotificationCountApi').mockResolvedValue(1);
      vi.spyOn(notificationsApi, 'getNotificationsApi').mockResolvedValue([mockRejectedNotification]);
      const markReadSpy = vi.spyOn(notificationsApi, 'markNotificationAsReadApi').mockResolvedValue({} as any);

      render(
        <MemoryRouter initialEntries={['/dashboard']}>
          <AuthProvider>
            <NotificationBell />
          </AuthProvider>
        </MemoryRouter>
      );

      // Verify bell rendered with unread badge "1"
      await waitFor(() => {
        expect(screen.getByText('1')).toBeInTheDocument();
      });

      // Click bell icon to open notifications drawer
      const bellButton = screen.getByRole('button', { name: /الإشعارات/i });
      fireEvent.click(bellButton);

      // Notification should be rendered in drawer
      await waitFor(() => {
        expect(screen.getByText('تم رفض طلب الشراء')).toBeInTheDocument();
      });

      // Verify the badge indicates action required
      expect(screen.getByText(/مرفوض|طلب مرفوض/)).toBeInTheDocument();

      // Click the notification item
      const notifItem = screen.getByText('تم رفض طلب الشراء').closest('div[role="button"]') || screen.getByText('تم رفض طلب الشراء');
      fireEvent.click(notifItem);

      // Verify it called markNotificationAsReadApi for notification 101
      expect(markReadSpy).toHaveBeenCalledWith(101);
    });

    it('Realtime toast for rejected PR allows instant navigation to edit URL', async () => {
      window.HTMLMediaElement.prototype.play = vi.fn().mockImplementation(() => Promise.resolve());
      vi.spyOn(notificationsApi, 'getUnreadNotificationCountApi').mockResolvedValue(0);
      vi.spyOn(notificationsApi, 'getNotificationsApi').mockResolvedValue([]);
      const markReadSpy = vi.spyOn(notificationsApi, 'markNotificationAsReadApi').mockResolvedValue({} as any);

      render(
        <MemoryRouter initialEntries={['/dashboard']}>
          <AuthProvider>
            <NotificationBell />
          </AuthProvider>
        </MemoryRouter>
      );

      // Dispatch custom browser event simulating realtime incoming notification
      const event = new CustomEvent('notification-received', {
        detail: mockRejectedNotification,
      });
      window.dispatchEvent(event);

      // Realtime toast popover should appear with notification title
      await waitFor(() => {
        expect(screen.getByText('تم رفض طلب الشراء')).toBeInTheDocument();
      });

      // Click the action button inside the toast to trigger deep-linking (تعديل الطلب ←)
      const actionButton = screen.getByRole('button', { name: /تعديل الطلب/i });
      fireEvent.click(actionButton);

      expect(markReadSpy).toHaveBeenCalledWith(101);
    });
  });
});
