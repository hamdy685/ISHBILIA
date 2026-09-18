import { Notification } from '../types/notification';
import { User } from '../types/auth';

export interface NotificationActionRoute {
  url: string;
  actionLabel: string;
  icon: string;
  badgeLabel: string;
  docType: 'PR' | 'PO' | 'QUOTE' | 'RECEIPT' | 'INVOICE' | 'PAYMENT' | 'PARCEL' | 'GENERAL';
  docNumber?: string;
  isActionable: boolean;
  priority: 'URGENT' | 'HIGH' | 'NORMAL' | 'LOW';
}

/**
 * Intelligent Document Extractor
 */
export const extractDocumentInfo = (notification: Notification & { data?: any }) => {
  const data = notification.data || {};
  const notifiableType = notification.notifiable_type || '';
  const type = notification.type || '';

  const prId = data.purchase_request_id || data.pr_id || (notifiableType.includes('PurchaseRequest') ? notification.notifiable_id : null);
  const poId = data.purchase_order_id || data.po_id || (notifiableType.includes('PurchaseOrder') ? notification.notifiable_id : null);
  const receiptId = data.purchase_receipt_id || data.receipt_id || (notifiableType.includes('PurchaseReceipt') ? notification.notifiable_id : null);
  const invoiceId = data.invoice_id || (notifiableType.includes('SupplierInvoice') ? notification.notifiable_id : null);
  const supplierId = data.supplier_id;
  const quoteId = data.quote_id || data.purchase_request_quote_id;

  let docNumber = data.pr_number || data.po_number || data.receipt_number || data.invoice_number;
  let docType: NotificationActionRoute['docType'] = 'GENERAL';

  if (quoteId || type.includes('quote')) {
    docType = 'QUOTE';
    docNumber = docNumber || (prId ? `PR-${prId}` : undefined);
  } else if (invoiceId || type.includes('invoice')) {
    docType = 'INVOICE';
    docNumber = docNumber || (invoiceId ? `INV-${invoiceId}` : undefined);
  } else if (receiptId || type.includes('receipt') || type.includes('grn')) {
    docType = 'RECEIPT';
    docNumber = docNumber || (receiptId ? `GRN-${receiptId}` : undefined);
  } else if (poId || type.includes('purchase_order') || type.includes('po_')) {
    docType = 'PO';
    docNumber = docNumber || (poId ? `PO-${poId}` : undefined);
  } else if (prId || type.includes('purchase_request') || type.includes('pr_')) {
    docType = 'PR';
    docNumber = docNumber || (prId ? `PR-${prId}` : undefined);
  } else if (supplierId || type.includes('payment')) {
    docType = 'PAYMENT';
  }

  return {
    prId,
    poId,
    receiptId,
    invoiceId,
    supplierId,
    quoteId,
    docType,
    docNumber,
  };
};

/**
 * Determines if a notification should be visible to a user.
 * Specifically, the Admin role must NOT receive ANY operational messages unless a system error or alert occurs.
 */
export const isAllowedNotificationForUser = (
  notification: Notification & { data?: any; target_url?: string },
  user: User | null
): boolean => {
  const roleSlugs = (user?.roles || []).map((r) => (typeof r === 'string' ? r : r.slug));
  const isAdmin = roleSlugs.includes('admin') && !roleSlugs.some((r) => ['employee', 'reviewer', 'procurement_manager', 'accountant', 'general_manager', 'site_engineer', 'warehouse_keeper'].includes(r));

  if (isAdmin) {
    const type = (notification.type || '').toLowerCase();
    const title = (notification.title || '').toLowerCase();
    const message = (notification.message || '').toLowerCase();
    return (
      type.startsWith('system_error') ||
      type.startsWith('system_alert') ||
      type.startsWith('system_issue') ||
      type.includes('error') ||
      type.includes('exception') ||
      title.includes('خطأ') ||
      title.includes('عطل') ||
      title.includes('مشكلة') ||
      title.includes('تنبيه النظام') ||
      message.includes('خادم') ||
      message.includes('استثناء')
    );
  }

  return true;
};

/**
 * Determines whether a notification strictly requires action from the current user
 * based on role and workflow status.
 */
export const isActionRequiredForUser = (
  notification: Notification & { data?: any; target_url?: string },
  user: User | null
): boolean => {
  if (!isAllowedNotificationForUser(notification, user)) {
    return false;
  }

  const roleSlugs = (user?.roles || []).map((r) => (typeof r === 'string' ? r : r.slug));
  const type = (notification.type || '').toLowerCase();
  const title = (notification.title || '').toLowerCase();
  const message = (notification.message || '').toLowerCase();

  // General Manager actions
  if (roleSlugs.includes('general_manager')) {
    if (type.includes('quote') || type.includes('recommendation') || title.includes('عروض') || message.includes('عروض')) return true;
    if (type.includes('po_submitted') || type.includes('po_pending') || title.includes('أمر شراء') || message.includes('أمر شراء')) return true;
    if (type.includes('gm_review') || type.includes('pending_gm') || title.includes('اعتماد') || message.includes('بانتظار موافقة المدير')) return true;
  }

  // Reviewer / Department Manager actions
  if (roleSlugs.includes('reviewer')) {
    if (type.includes('submitted') || type.includes('pending_review') || title.includes('مراجعة') || message.includes('جديد للمراجعة')) return true;
    if (type.includes('quote') || type.includes('recommendation') || title.includes('ترشيح') || message.includes('ترشيح')) return true;
  }

  // Procurement Manager actions
  if (roleSlugs.includes('procurement_manager')) {
    if (type.includes('approved') && !type.includes('po_issued') && (title.includes('معتمد') || message.includes('معتمد'))) return true;
    if (type.includes('quote_selected') || title.includes('تم اختيار عرض') || message.includes('إصدار أمر الشراء')) return true;
    if (type.includes('returned') || type.includes('rejected') || title.includes('إعادة') || message.includes('إرجاع')) return true;
  }

  // Accountant actions
  if (roleSlugs.includes('accountant')) {
    if (type.includes('receipt') || type.includes('grn') || type.includes('delivered') || title.includes('استلام') || message.includes('استلام')) return true;
    if (type.includes('invoice') || title.includes('فاتورة') || message.includes('فاتورة')) return true;
    if (type.includes('quote_recommendation') || title.includes('عروض أسعار') || message.includes('الرأي المالي')) return true;
  }

  // Site Engineer / Warehouse actions
  if (roleSlugs.includes('site_engineer') || roleSlugs.includes('warehouse_keeper')) {
    if (type.includes('po_issued') || type.includes('delivery') || title.includes('توريد') || message.includes('توريد') || title.includes('استلام')) return true;
  }

  // Requester action if explicitly returned for amendment (Rejected is final and cannot be edited)
  if (type.includes('returned') || title.includes('إعادة للتعديل') || message.includes('إعادة للتعديل')) {
    return true;
  }

  // Fallback explicit check on action keywords
  return (
    type.includes('action_required') ||
    type.includes('pending') ||
    type.includes('submitted') ||
    title.includes('مطلوب') ||
    title.includes('بانتظار')
  );
};

/**
 * Intelligent Deep-Link Router for Notifications
 * Resolves the EXACT decision page based on document type and user role.
 */
export const resolveNotificationAction = (
  notification: Notification & { data?: any; target_url?: string },
  user: User | null
): NotificationActionRoute => {
  const roleSlugs = (user?.roles || []).map((role) => (typeof role === 'string' ? role : role.slug));
  const data = notification.data || {};
  const type = (notification.type || '').toLowerCase();
  const title = (notification.title || '').toLowerCase();
  const message = (notification.message || '').toLowerCase();
  const info = extractDocumentInfo(notification);
  const isActionable = isActionRequiredForUser(notification, user);

  // Determine Priority
  let priority: NotificationActionRoute['priority'] = 'NORMAL';
  if (data.priority === 'URGENT' || type.includes('urgent') || type.includes('returned') || type.includes('rejected')) {
    priority = 'URGENT';
  } else if (data.priority === 'HIGH' || isActionable) {
    priority = 'HIGH';
  }

  // 0. Dedicated check for PO & Receipt ready for accounting
  if (type.includes('purchase_order_and_receipt_ready_accounting') || title.includes('جاهزان للحسابات')) {
    const receiptId = info.receiptId || notification.purchase_receipt_id || data.purchase_receipt_id;
    const poId = info.poId || notification.purchase_order_id || data.purchase_order_id;
    if (roleSlugs.includes('accountant')) {
      return {
        url: poId
          ? `/accounting/purchase-orders/${poId}${receiptId ? `?receipt_id=${receiptId}` : ''}`
          : (receiptId ? `/accounting/supplier-payments?tab=payments&purchase_receipt_id=${receiptId}` : '/accounting/purchase-orders'),
        actionLabel: 'فتح أمر الشراء وإذن الاستلام',
        icon: '⚡',
        badgeLabel: 'مطلوب إجراء',
        docType: 'PO',
        docNumber: info.docNumber,
        isActionable: true,
        priority: 'HIGH',
      };
    }
  }

  // 1. Explicit Target URL override if specified directly by backend
  if (notification.target_url && notification.target_url !== '/' && notification.target_url !== '/notifications') {
    let targetUrl = notification.target_url;

    // Sanitize targetUrl so user doesn't hit 403 on mismatched role prefix!
    const poMatch = targetUrl.match(/^\/procurement\/purchase-orders\/(\d+)/);
    if (poMatch) {
      const poId = poMatch[1];
      if (roleSlugs.includes('accountant')) {
        const receiptId = info.receiptId || notification.purchase_receipt_id || data.purchase_receipt_id;
        targetUrl = `/accounting/purchase-orders/${poId}${receiptId ? `?receipt_id=${receiptId}` : ''}`;
      } else if (roleSlugs.includes('general_manager')) {
        targetUrl = `/general-manager/purchase-orders/${poId}`;
      } else if (!roleSlugs.includes('procurement_manager') && !roleSlugs.includes('admin')) {
        targetUrl = '/requests';
      }
    } else if (targetUrl.startsWith('/procurement/') && !roleSlugs.includes('procurement_manager') && !roleSlugs.includes('admin')) {
      if (roleSlugs.includes('accountant')) {
        targetUrl = '/accounting';
      } else if (roleSlugs.includes('general_manager')) {
        targetUrl = '/general-manager';
      } else {
        targetUrl = '/requests';
      }
    } else if (targetUrl.startsWith('/accounting/') && !roleSlugs.includes('accountant') && !roleSlugs.includes('admin')) {
      if (roleSlugs.includes('general_manager')) {
        targetUrl = targetUrl.replace('/accounting/', '/general-manager/');
      } else if (roleSlugs.includes('procurement_manager')) {
        targetUrl = targetUrl.replace('/accounting/', '/procurement/');
      }
    }

    // Determine intelligent, human-friendly action labels and icons
    let actionLabel = isActionable ? 'متابعة الإجراء المطلوب' : 'عرض ومتابعة الطلب';
    let icon = isActionable ? '⚡' : '📋';
    let badgeLabel = isActionable ? 'مطلوب إجراء' : 'إشعار';

    if (info.prId) {
      if (roleSlugs.includes('general_manager')) {
        targetUrl = `/general-manager/purchase-requests?open=${info.prId}`;
        const isReturned = title.includes('مباشر') || title.includes('مسعر') || message.includes('مدير المشتريات') || type.includes('direct');
        actionLabel = isReturned ? 'اعتماد تنفيذي نهائي' : 'موافقة وإرسال للمشتريات';
        badgeLabel = isReturned ? 'راجع من المشتريات' : 'رايح للمشتريات';
        icon = isReturned ? '👑' : '📤';
      } else if (roleSlugs.includes('reviewer')) {
        targetUrl = `/reviewer/requests/${info.prId}`;
        actionLabel = 'مراجعة واعتماد الطلب';
        icon = '📋';
        badgeLabel = 'مراجعة طلب';
      } else if (roleSlugs.includes('procurement_manager')) {
        targetUrl = `/procurement/purchase-orders/create?pr=${info.prId}`;
        actionLabel = 'إصدار أمر الشراء';
        icon = '📑';
        badgeLabel = 'جاهز للإصدار';
      } else if (roleSlugs.includes('accountant')) {
        targetUrl = `/accounting/purchase-requests?open=${info.prId}`;
        actionLabel = 'مراجعة واعتماد الطلب المالي';
        icon = '💳';
        badgeLabel = 'اعتماد مالي';
      }
    } else if (info.poId) {
      if (roleSlugs.includes('general_manager')) {
        targetUrl = `/general-manager/purchase-orders/${info.poId}`;
        actionLabel = 'اعتماد أمر الشراء';
        icon = '📑';
        badgeLabel = 'أمر شراء';
      } else if (roleSlugs.includes('procurement_manager')) {
        actionLabel = 'عرض وتعديل أمر الشراء';
        icon = '📦';
        badgeLabel = 'أمر شراء';
      }
    }

    return {
      url: targetUrl,
      actionLabel,
      icon,
      badgeLabel,
      docType: info.docType,
      docNumber: info.docNumber,
      isActionable,
      priority,
    };
  }

  // 2. Material Receipts & Goods Received Notes (أذونات الاستلام والفحص)
  if (info.docType === 'RECEIPT' || info.receiptId || type.includes('receipt') || type.includes('grn') || type.includes('goods_received')) {
    const receiptParam = info.receiptId ? `receipt_id=${info.receiptId}` : '';
    const isDeptAccountant = roleSlugs.some((r) => ['site_accountant', 'licenses_accountant', 'buffet_accountant'].includes(r));
    if (roleSlugs.includes('accountant') || isDeptAccountant) {
      return {
        url: info.receiptId
          ? `/accounting/supplier-payments?purchase_receipt_id=${info.receiptId}${isDeptAccountant ? '&action=create_invoice' : ''}`
          : '/accounting/supplier-payments',
        actionLabel: isDeptAccountant ? 'تسجيل فاتورة المورد' : 'مطابقة إذن الاستلام والمديونية',
        icon: '🧾',
        badgeLabel: 'إذن استلام جاهز',
        docType: 'RECEIPT',
        docNumber: info.docNumber,
        isActionable,
        priority,
      };
    }
    if (roleSlugs.includes('warehouse_keeper') && !roleSlugs.includes('site_engineer')) {
      return {
        url: receiptParam ? `/warehouse?${receiptParam}` : '/warehouse',
        actionLabel: 'إذن فحص واستلام المستودع',
        icon: '📦',
        badgeLabel: 'استلام مستودع',
        docType: 'RECEIPT',
        docNumber: info.docNumber,
        isActionable,
        priority,
      };
    }
    // Site Engineer / Reviewer / Others handling receipts
    return {
      url: receiptParam ? `/site-engineer?${receiptParam}` : '/site-engineer',
      actionLabel: 'فحص واعتماد إذن الاستلام',
      icon: '🚚',
      badgeLabel: 'استلام موقع',
      docType: 'RECEIPT',
      docNumber: info.docNumber,
      isActionable: true,
      priority: 'HIGH',
    };
  }

  const isExplicitlyWithoutQuotes =
    message.includes('بدون عروض') ||
    title.includes('بدون عروض') ||
    type.includes('direct') ||
    type.includes('pending_accounting_approval') ||
    type.includes('accounting_approval');

  // 3. Purchase Quotes (عروض الأسعار والترشيحات)
  if (!isExplicitlyWithoutQuotes && (info.docType === 'QUOTE' || info.quoteId || type.includes('quote') || type.includes('recommendation') || title.includes('عروض أسعار') || (message.includes('عروض أسعار') && !message.includes('بدون عروض')))) {
    const openParam = info.prId ? `?open=${info.prId}` : '';
    if (roleSlugs.includes('general_manager')) {
      return {
        url: `/general-manager/purchase-quotes${openParam}`,
        actionLabel: 'البت في عروض الأسعار',
        icon: '⚖️',
        badgeLabel: 'عروض أسعار',
        docType: 'QUOTE',
        docNumber: info.docNumber,
        isActionable,
        priority,
      };
    }
    if (roleSlugs.includes('reviewer')) {
      return {
        url: `/reviewer/purchase-quotes${openParam}`,
        actionLabel: 'ترشيح عرض السعر',
        icon: '⚖️',
        badgeLabel: 'عروض أسعار',
        docType: 'QUOTE',
        docNumber: info.docNumber,
        isActionable,
        priority,
      };
    }
    if (roleSlugs.includes('accountant')) {
      return {
        url: `/accounting/purchase-quotes${openParam}`,
        actionLabel: 'الرأي المالي في العروض',
        icon: '⚖️',
        badgeLabel: 'عروض أسعار',
        docType: 'QUOTE',
        docNumber: info.docNumber,
        isActionable,
        priority,
      };
    }
    if (roleSlugs.includes('procurement_manager')) {
      return {
        url: info.quoteId && info.prId
          ? `/procurement/purchase-orders/create?pr=${info.prId}&quote=${info.quoteId}`
          : '/procurement',
        actionLabel: 'إصدار أمر الشراء فوراً',
        icon: '⚡',
        badgeLabel: 'جاهز للإصدار',
        docType: 'PO',
        docNumber: info.docNumber,
        isActionable,
        priority,
      };
    }
    return {
      url: `/reviewer/purchase-quotes${openParam}`,
      actionLabel: 'معاينة عروض الأسعار',
      icon: '⚖️',
      badgeLabel: 'عروض أسعار',
      docType: 'QUOTE',
      docNumber: info.docNumber,
      isActionable,
      priority,
    };
  }

  // 4. Invoices and Supplier Payments (الفواتير وسداد الموردين)
  if (info.docType === 'INVOICE' || info.invoiceId || type.includes('invoice')) {
    return {
      url: `/accounting/supplier-payments?invoice_id=${info.invoiceId || ''}`,
      actionLabel: 'تسجيل ومطابقة الفاتورة',
      icon: '💰',
      badgeLabel: 'فاتورة مورد',
      docType: 'INVOICE',
      docNumber: info.docNumber,
      isActionable,
      priority,
    };
  }

  if (info.docType === 'PAYMENT' || info.supplierId || type.includes('payment')) {
    return {
      url: `/accounting/supplier-accounts?supplier_id=${info.supplierId || ''}`,
      actionLabel: 'كشف حساب وسداد الدفعة',
      icon: '🏦',
      badgeLabel: 'سداد دفعة',
      docType: 'PAYMENT',
      isActionable,
      priority,
    };
  }

  // 5. Purchase Orders (أوامر الشراء)
  if (info.docType === 'PO' || info.poId || type.includes('purchase_order') || type.includes('po_')) {
    const isReturned = type.includes('returned') || type.includes('rejected');
    if (roleSlugs.includes('warehouse_keeper') && !roleSlugs.includes('site_engineer')) {
      return {
        url: '/warehouse',
        actionLabel: 'فحص واستلام المواد بالمستودع',
        icon: '📦',
        badgeLabel: 'استلام مستودع',
        docType: 'PO',
        docNumber: info.docNumber,
        isActionable: true,
        priority: 'HIGH',
      };
    }
    if (roleSlugs.includes('general_manager')) {
      return {
        url: info.poId ? `/general-manager/purchase-orders/${info.poId}` : '/general-manager/purchase-orders',
        actionLabel: 'اعتماد أمر الشراء',
        icon: '📑',
        badgeLabel: 'أمر شراء',
        docType: 'PO',
        docNumber: info.docNumber,
        isActionable,
        priority,
      };
    }
    if (roleSlugs.includes('accountant')) {
      return {
        url: info.poId ? `/accounting/purchase-orders/${info.poId}` : '/accounting/purchase-orders',
        actionLabel: 'الاطلاع المالي على أمر الشراء',
        icon: '💳',
        badgeLabel: 'أمر شراء',
        docType: 'PO',
        docNumber: info.docNumber,
        isActionable,
        priority,
      };
    }
    if (roleSlugs.includes('procurement_manager')) {
      return {
        url: info.poId
          ? (isReturned ? `/procurement/purchase-orders/${info.poId}/edit` : `/procurement/purchase-orders/${info.poId}`)
          : '/procurement',
        actionLabel: isReturned ? 'تعديل أمر الشراء المعاد' : 'عرض وتعديل أمر الشراء',
        icon: '📦',
        badgeLabel: 'أمر شراء',
        docType: 'PO',
        docNumber: info.docNumber,
        isActionable,
        priority,
      };
    }
    return {
      url: info.prId ? `/requests/${info.prId}` : (info.poId ? `/procurement/purchase-orders/${info.poId}` : '/requests'),
      actionLabel: 'عرض تفاصيل المعاملة',
      icon: '📑',
      badgeLabel: 'أمر شراء',
      docType: 'PO',
      docNumber: info.docNumber,
      isActionable,
      priority,
    };
  }

  // 6. Purchase Requests (طلبات الشراء)
  if (info.prId) {
    const isReturned = type.includes('returned') || title.includes('إعادة للتعديل');
    const isRejected = type.includes('rejected') || title.includes('مرفوض');

    if (roleSlugs.includes('general_manager')) {
      return {
        url: `/general-manager/purchase-requests?open=${info.prId}`,
        actionLabel: 'اتخاذ قرار في الطلب',
        icon: '📋',
        badgeLabel: 'طلب شراء',
        docType: 'PR',
        docNumber: info.docNumber,
        isActionable,
        priority,
      };
    }

    if (roleSlugs.includes('accountant')) {
      return {
        url: `/accounting/purchase-requests?open=${info.prId}`,
        actionLabel: 'مراجعة واعتماد الطلب المالي',
        icon: '⚖️',
        badgeLabel: 'طلب مباشر',
        docType: 'PR',
        docNumber: info.docNumber,
        isActionable: true,
        priority: 'HIGH',
      };
    }

    if (roleSlugs.includes('reviewer') && (type.includes('submitted') || type.includes('pending') || type.includes('review') || !roleSlugs.includes('employee'))) {
      return {
        url: `/reviewer/requests/${info.prId}`,
        actionLabel: 'مراجعة واعتماد الطلب',
        icon: '📋',
        badgeLabel: 'مراجعة طلب',
        docType: 'PR',
        docNumber: info.docNumber,
        isActionable,
        priority,
      };
    }

    if (roleSlugs.includes('procurement_manager') && type.includes('approved')) {
      return {
        url: `/procurement/purchase-orders/create?pr=${info.prId}`,
        actionLabel: 'إصدار أمر الشراء',
        icon: '📑',
        badgeLabel: 'طلب معتمد',
        docType: 'PR',
        docNumber: info.docNumber,
        isActionable,
        priority,
      };
    }

    // Default Requester / Employee / Site Engineer PR
    const needsEdit = isReturned || isRejected || data?.status === 'REJECTED' || data?.can_edit;
    return {
      url: needsEdit
        ? `/requests/${info.prId}/edit`
        : (roleSlugs.includes('employee') && !roleSlugs.some((r) => ['reviewer', 'general_manager', 'accountant', 'procurement_manager', 'admin'].includes(r))
            ? `/employee/requests/${info.prId}`
            : `/requests/${info.prId}`),
      actionLabel: needsEdit ? 'تعديل الطلب' : 'عرض ومتابعة الطلب',
      icon: isReturned ? '✏️' : (isRejected ? '🚫' : '📋'),
      badgeLabel: isReturned ? 'معاد للتعديل' : (isRejected ? 'طلب مرفوض' : 'طلبي'),
      docType: 'PR',
      docNumber: info.docNumber,
      isActionable: isReturned || isRejected,
      priority: (isReturned || isRejected) ? 'URGENT' : priority,
    };
  }

  // 7. General Role Fallback
  if (roleSlugs.includes('general_manager')) {
    return {
      url: '/general-manager',
      actionLabel: 'لوحة المدير العام',
      icon: '👑',
      badgeLabel: 'إدارة عامة',
      docType: 'GENERAL',
      isActionable,
      priority,
    };
  }

  if (roleSlugs.includes('reviewer')) {
    return {
      url: '/reviewer/requests',
      actionLabel: 'قائمة مراجعة الطلبات',
      icon: '📋',
      badgeLabel: 'مراجعة',
      docType: 'PR',
      isActionable,
      priority,
    };
  }

  if (roleSlugs.includes('procurement_manager')) {
    return {
      url: '/procurement',
      actionLabel: 'لوحة إدارة المشتريات',
      icon: '🛒',
      badgeLabel: 'مشتريات',
      docType: 'GENERAL',
      isActionable,
      priority,
    };
  }

  if (roleSlugs.includes('accountant')) {
    return {
      url: '/accounting',
      actionLabel: 'لوحة الحسابات العامة',
      icon: '💼',
      badgeLabel: 'حسابات',
      docType: 'GENERAL',
      isActionable,
      priority,
    };
  }

  if (roleSlugs.includes('site_engineer')) {
    return {
      url: '/site-engineer',
      actionLabel: 'استلامات الموقع',
      icon: '🧰',
      badgeLabel: 'موقع',
      docType: 'RECEIPT',
      isActionable,
      priority,
    };
  }

  if (roleSlugs.includes('warehouse_keeper')) {
    return {
      url: '/warehouse',
      actionLabel: 'إدارة المخزن والمستودع',
      icon: '🏢',
      badgeLabel: 'مستودع',
      docType: 'RECEIPT',
      isActionable,
      priority,
    };
  }

  return {
    url: notification.target_url || '/requests',
    actionLabel: 'عرض التفاصيل',
    icon: '🔔',
    badgeLabel: 'إشعار',
    docType: 'GENERAL',
    isActionable,
    priority,
  };
};
