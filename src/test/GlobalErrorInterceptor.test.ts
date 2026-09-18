import { describe, it, expect, vi, beforeEach } from 'vitest';
import apiClient, {
  translateApiError,
  formatValidationErrors,
  handleResponseError,
  redirectToLogin,
  setOnUnauthenticated,
} from '../api/client';
import toast from '../utils/toast';
import * as authStorage from '../utils/authStorage';

describe('Global Error Interceptor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('1. Status Code Mapping and Translation', () => {
    it('translates network / disconnected internet error (!error.response)', () => {
      const networkError = new Error('Network Error');
      const translated = translateApiError(networkError);
      expect(translated).toBe('انقطع الاتصال بالإنترنت. تأكد من الشبكة وحاول مجدداً.');
    });

    it('translates null/undefined error as network disconnect', () => {
      expect(translateApiError(null)).toBe('انقطع الاتصال بالإنترنت. تأكد من الشبكة وحاول مجدداً.');
      expect(translateApiError(undefined)).toBe('انقطع الاتصال بالإنترنت. تأكد من الشبكة وحاول مجدداً.');
    });

    it('translates 401 Unauthorized status', () => {
      const error401 = {
        response: { status: 401, data: {} },
        config: { url: '/purchase-requests' },
      };
      const translated = translateApiError(error401);
      expect(translated).toBe('انتهت الجلسة. يرجى تسجيل الدخول من جديد.');
    });

    it('preserves specific Arabic credential error message on /auth/login endpoint for 401', () => {
      const login401 = {
        response: { status: 401, data: { message: 'بيانات الدخول غير صحيحة.' } },
        config: { url: '/auth/login' },
      };
      const translated = translateApiError(login401);
      expect(translated).toBe('بيانات الدخول غير صحيحة.');
    });

    it('translates 403 Forbidden status', () => {
      const error403 = {
        response: { status: 403, data: {} },
      };
      const translated = translateApiError(error403);
      expect(translated).toBe('عفواً، لا تملك الصلاحية الكافية لإتمام هذا الإجراء.');
    });

    it('translates 404 Not Found status', () => {
      const error404 = {
        response: { status: 404, data: {} },
      };
      const translated = translateApiError(error404);
      expect(translated).toBe('البيانات المطلوبة غير موجودة أو تم حذفها.');
    });

    it('translates 500 and higher Server Error status (500, 502, 503)', () => {
      [500, 502, 503, 504].forEach((statusCode) => {
        const error500 = {
          response: { status: statusCode, data: {} },
        };
        const translated = translateApiError(error500);
        expect(translated).toBe('حدث عطل مؤقت في النظام. يرجى المحاولة بعد قليل.');
      });
    });
  });

  describe('2. 422 Validation Error Extraction and Formatting', () => {
    it('extracts and merges object dictionary validation errors into a single Arabic string', () => {
      const errors = {
        email: ['البريد الإلكتروني مستخدم بالفعل'],
        title: ['حقل العنوان مطلوب'],
        quantity: ['يجب إدخال كمية صحيحة'],
      };
      const result = formatValidationErrors(errors);
      expect(result).toBe('البريد الإلكتروني مستخدم بالفعل • حقل العنوان مطلوب • يجب إدخال كمية صحيحة');
    });

    it('extracts and merges flat array validation errors', () => {
      const errors = ['حقل الاسم مطلوب', 'رقم الهاتف غير صحيح'];
      const result = formatValidationErrors(errors);
      expect(result).toBe('حقل الاسم مطلوب • رقم الهاتف غير صحيح');
    });

    it('extracts and merges nested validation structures', () => {
      const errors = {
        items: [
          { name: ['اسم الصنف مطلوب'] },
          { quantity: ['الكمية لا يمكن أن تكون صفراً'] },
        ],
      };
      const result = formatValidationErrors(errors);
      expect(result).toBe('اسم الصنف مطلوب • الكمية لا يمكن أن تكون صفراً');
    });

    it('deduplicates repetitive error messages', () => {
      const errors = {
        field1: ['هذا الحقل مطلوب'],
        field2: ['هذا الحقل مطلوب'],
      };
      const result = formatValidationErrors(errors);
      expect(result).toBe('هذا الحقل مطلوب');
    });

    it('translates common Laravel validation messages in English if received', () => {
      const errors = {
        email: ['The email field is required.'],
        code: ['The code has already been taken.'],
      };
      const result = formatValidationErrors(errors);
      expect(result).toBe('هذا الحقل مطلوب. • هذه القيمة مستخدمة بالفعل.');
    });

    it('translates full 422 error object via translateApiError', () => {
      const error422 = {
        response: {
          status: 422,
          data: {
            message: 'The given data was invalid.',
            errors: {
              title: ['حقل عنوان الطلب مطلوب'],
              supplier_id: ['يرجى اختيار المورد المعتمد'],
            },
          },
        },
      };
      const translated = translateApiError(error422);
      expect(translated).toBe('حقل عنوان الطلب مطلوب • يرجى اختيار المورد المعتمد');
    });

    it('falls back gracefully when 422 data has no errors dictionary', () => {
      const error422WithoutErrors = {
        response: {
          status: 422,
          data: {},
        },
      };
      const translated = translateApiError(error422WithoutErrors);
      expect(translated).toBe('بيانات غير صالحة. يرجى مراجعة الحقول المطلوبة والتأكد من صحة المدخلات.');
    });
  });

  describe('3. Response Error Interceptor Handler and Session Management', () => {
    it('handles 401: marks session expired, removes token, calls onUnauthenticated, and redirects', async () => {
      const markSessionExpiredSpy = vi.spyOn(authStorage, 'markSessionExpired');
      const removeTokenSpy = vi.spyOn(authStorage, 'removeToken');
      const unauthCallback = vi.fn();
      setOnUnauthenticated(unauthCallback);

      const error = {
        response: { status: 401, data: {} },
        config: { url: '/procurement/orders' },
        message: 'Request failed with status code 401',
      };

      await expect(handleResponseError(error)).rejects.toMatchObject({
        message: 'انتهت الجلسة. يرجى تسجيل الدخول من جديد.',
      });

      expect(markSessionExpiredSpy).toHaveBeenCalled();
      expect(removeTokenSpy).toHaveBeenCalled();
      expect(unauthCallback).toHaveBeenCalled();
      expect(error.message).toBe('انتهت الجلسة. يرجى تسجيل الدخول من جديد.');
      expect(error.response.data.message).toBe('انتهت الجلسة. يرجى تسجيل الدخول من جديد.');
    });

    it('does not mark session expired when 401 occurs on login endpoint', async () => {
      const markSessionExpiredSpy = vi.spyOn(authStorage, 'markSessionExpired');
      const removeTokenSpy = vi.spyOn(authStorage, 'removeToken');

      const loginError = {
        response: { status: 401, data: { message: 'بيانات الدخول غير صحيحة' } },
        config: { url: '/auth/login' },
        message: 'Unauthorized',
      };

      await expect(handleResponseError(loginError)).rejects.toBeDefined();

      expect(markSessionExpiredSpy).not.toHaveBeenCalled();
      expect(removeTokenSpy).not.toHaveBeenCalled();
      expect(loginError.message).toBe('بيانات الدخول غير صحيحة');
    });

    it('redirects to /login safely without crashing in test environments', () => {
      expect(() => redirectToLogin()).not.toThrow();
    });
  });

  describe('4. Unified Notification Interface: Direct toast.error(error.message) Integration', () => {
    it('allows components to catch error and call toast.error(error.message) with exact 403 translation', async () => {
      const toastErrorSpy = vi.spyOn(toast, 'error');

      const raw403Error = {
        response: { status: 403, data: { message: 'Forbidden' } },
        message: 'Request failed with status code 403',
      };

      try {
        await handleResponseError(raw403Error);
      } catch (err: any) {
        // Direct component usage without if/else:
        toast.error(err.message);
      }

      expect(toastErrorSpy).toHaveBeenCalledWith('عفواً، لا تملك الصلاحية الكافية لإتمام هذا الإجراء.');
    });

    it('allows components to catch error and call toast.error(error.message) with exact 404 translation', async () => {
      const toastErrorSpy = vi.spyOn(toast, 'error');

      const raw404Error = {
        response: { status: 404, data: {} },
        message: 'Request failed with status code 404',
      };

      try {
        await handleResponseError(raw404Error);
      } catch (err: any) {
        toast.error(err.message);
      }

      expect(toastErrorSpy).toHaveBeenCalledWith('البيانات المطلوبة غير موجودة أو تم حذفها.');
    });

    it('allows components to catch error and call toast.error(error.message) with exact 422 validation translation', async () => {
      const toastErrorSpy = vi.spyOn(toast, 'error');

      const raw422Error = {
        response: {
          status: 422,
          data: {
            errors: {
              justification: ['حقل مبررات الطلب إلزامي'],
              urgency: ['يرجى تحديد درجة الأهمية'],
            },
          },
        },
        message: 'Request failed with status code 422',
      };

      try {
        await handleResponseError(raw422Error);
      } catch (err: any) {
        toast.error(err.message);
      }

      expect(toastErrorSpy).toHaveBeenCalledWith('حقل مبررات الطلب إلزامي • يرجى تحديد درجة الأهمية');
    });

    it('allows components to catch error and call toast.error(error.message) with exact 500 server translation', async () => {
      const toastErrorSpy = vi.spyOn(toast, 'error');

      const raw500Error = {
        response: { status: 500, data: {} },
        message: 'Internal Server Error',
      };

      try {
        await handleResponseError(raw500Error);
      } catch (err: any) {
        toast.error(err.message);
      }

      expect(toastErrorSpy).toHaveBeenCalledWith('حدث عطل مؤقت في النظام. يرجى المحاولة بعد قليل.');
    });

    it('allows components to catch error and call toast.error(error.message) with exact network disconnected translation', async () => {
      const toastErrorSpy = vi.spyOn(toast, 'error');

      const networkDropError = new Error('Network Error');

      try {
        await handleResponseError(networkDropError);
      } catch (err: any) {
        toast.error(err.message);
      }

      expect(toastErrorSpy).toHaveBeenCalledWith('انقطع الاتصال بالإنترنت. تأكد من الشبكة وحاول مجدداً.');
    });

    it('intercepts real apiClient HTTP call failures through Axios interceptor pipeline directly', async () => {
      const toastErrorSpy = vi.spyOn(toast, 'error');
      const originalAdapter = apiClient.defaults.adapter;

      // Mock adapter to simulate server 500 failure
      apiClient.defaults.adapter = async (config) => {
        const error: any = new Error('Request failed with status code 500');
        error.response = {
          status: 500,
          data: {},
          statusText: 'Internal Server Error',
          headers: {},
          config,
        };
        error.config = config;
        error.isAxiosError = true;
        throw error;
      };

      try {
        await apiClient.get('/test-500-endpoint');
      } catch (err: any) {
        // Direct component usage without if/else:
        toast.error(err.message);
      } finally {
        apiClient.defaults.adapter = originalAdapter;
      }

      expect(toastErrorSpy).toHaveBeenCalledWith('حدث عطل مؤقت في النظام. يرجى المحاولة بعد قليل.');
    });
  });
});
