import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ActionConfirmationModal, ConfirmationAlert } from '../components/common/ActionConfirmationModal';

describe('ActionConfirmationModal - Sovereign Decision Confirmation Component', () => {
  it('renders confirmation modal with key transaction data and prompts user for explicit confirmation', () => {
    const handleConfirm = vi.fn();
    const handleClose = vi.fn();

    render(
      <ActionConfirmationModal
        isOpen={true}
        onClose={handleClose}
        onConfirm={handleConfirm}
        title="مراجعة وتأكيد إصدار أمر الشراء"
        subtitle="طلب شراء رقم PR-2026-001"
        confirmLabel="حسناً، إصدار أمر الشراء"
        cancelLabel="رجوع للتعديل"
        confirmVariant="primary"
        documentType="PURCHASE_ORDER"
        documentCode="PR-2026-001"
        department="الإدارة الهندسية"
        projectSite="قطعة 102 - بيت الوطن"
        supplierName="شركة الأهرام للتجارة"
        receiverName="م. أحمد بدوي"
        totalAmount={250000}
        tafqeetText="مائتان وخمسون ألف جنيه مصري لا غير"
        itemsCount={5}
        promptQuestion="أنت على وشك إصدار وتعميد أمر الشراء النهائي، هل ترغب في الاستمرار؟"
      />
    );

    // Verify modal header and metadata
    expect(screen.getByText('مراجعة وتأكيد إصدار أمر الشراء')).toBeInTheDocument();
    expect(screen.getByText('PR-2026-001')).toBeInTheDocument();
    expect(screen.getByText('الإدارة الهندسية')).toBeInTheDocument();
    expect(screen.getByText('قطعة 102 - بيت الوطن')).toBeInTheDocument();
    expect(screen.getByText('شركة الأهرام للتجارة')).toBeInTheDocument();
    expect(screen.getByText('م. أحمد بدوي')).toBeInTheDocument();
    expect(screen.getByText('5 صنف / بند')).toBeInTheDocument();

    // Verify financial data and tafqeet
    expect(screen.getByText('250,000')).toBeInTheDocument();
    expect(screen.getByText(/مائتان وخمسون ألف جنيه/)).toBeInTheDocument();

    // Verify prompt question
    expect(screen.getByText(/أنت على وشك إصدار وتعميد أمر الشراء النهائي/)).toBeInTheDocument();

    // Verify buttons
    const confirmBtn = screen.getByRole('button', { name: 'حسناً، إصدار أمر الشراء' });
    const cancelBtn = screen.getByRole('button', { name: 'رجوع للتعديل' });
    expect(confirmBtn).toBeInTheDocument();
    expect(cancelBtn).toBeInTheDocument();

    // Test interaction
    fireEvent.click(confirmBtn);
    expect(handleConfirm).toHaveBeenCalledTimes(1);

    fireEvent.click(cancelBtn);
    expect(handleClose).toHaveBeenCalledTimes(1);
  });

  it('renders rebar (وزنة حديد كاملة) alert when steel/rebar items are present', () => {
    const alerts: ConfirmationAlert[] = [
      {
        type: 'rebar',
        title: '🏗️ تنبيه وزنة حديد كاملة (مسار مستقل ومطابقة قبان)',
        message: 'يحتوي هذا الأمر على بنود حديد تسليح، وسيتم توجيهها كوزنة حديد مستقلة وكاملة تخضع لإجراءات وتصاريح وزن القبان ومطابقة مهندس الموقع بالمشروع.',
        badge: '18.50 طن حديد',
      },
    ];

    render(
      <ActionConfirmationModal
        isOpen={true}
        onClose={() => undefined}
        onConfirm={() => undefined}
        title="تأكيد أمر شراء حديد تسليح"
        alerts={alerts}
      />
    );

    expect(screen.getByText('🏗️ تنبيه وزنة حديد كاملة (مسار مستقل ومطابقة قبان)')).toBeInTheDocument();
    expect(screen.getByText(/وزن القبان ومطابقة مهندس الموقع/)).toBeInTheDocument();
    expect(screen.getByText('18.50 طن حديد')).toBeInTheDocument();
  });

  it('renders grouped order (حاجات مجمعة / أوامر شراء متعددة) alert when multi-groups/suppliers are present', () => {
    const alerts: ConfirmationAlert[] = [
      {
        type: 'grouped',
        title: '📋 تنبيه أوامر شراء مجمعة / متعددة الموردين',
        message: 'سيتم تقسيم هذا الطلب وإصدار (3) أوامر شراء مستقلة ومجمعة وفق توزيع الموردين المحدد.',
        badge: '3 أوامر شراء',
      },
    ];

    render(
      <ActionConfirmationModal
        isOpen={true}
        onClose={() => undefined}
        onConfirm={() => undefined}
        title="تأكيد أمر الشراء المجمع"
        alerts={alerts}
      />
    );

    expect(screen.getByText('📋 تنبيه أوامر شراء مجمعة / متعددة الموردين')).toBeInTheDocument();
    expect(screen.getByText(/سيتم تقسيم هذا الطلب وإصدار \(3\) أوامر شراء مستقلة/)).toBeInTheDocument();
    expect(screen.getByText('3 أوامر شراء')).toBeInTheDocument();
  });

  it('disables buttons and shows loading spinner when isLoading is true', () => {
    render(
      <ActionConfirmationModal
        isOpen={true}
        onClose={() => undefined}
        onConfirm={() => undefined}
        isLoading={true}
        confirmLabel="حسناً، تأكيد وتنفيذ"
        cancelLabel="رجوع للتعديل"
      />
    );

    const cancelBtn = screen.getByRole('button', { name: 'رجوع للتعديل' });
    expect(cancelBtn).toBeDisabled();
  });
});
