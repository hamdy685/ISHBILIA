import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import {
  FavoriteRequest,
  getFavoriteRequests,
  deleteFavoriteRequest,
  updateFavoriteRequestTitle,
} from '../../utils/favoriteRequestsStorage';

export const FavoriteRequestsPage: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [favorites, setFavorites] = useState<FavoriteRequest[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState('');
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null);

  const loadFavorites = () => {
    const list = getFavoriteRequests(user?.id);
    setFavorites(list);
  };

  useEffect(() => {
    loadFavorites();
  }, [user?.id]);

  const showFeedback = (msg: string) => {
    setFeedbackMessage(msg);
    const timer = setTimeout(() => setFeedbackMessage(null), 3500);
    return () => clearTimeout(timer);
  };

  const handleUseFavorite = (fav: FavoriteRequest) => {
    // Navigate to create page with favorite data
    navigate('/requests/create', {
      state: {
        fromFavorite: true,
        favoriteTemplate: fav,
      },
    });
  };

  const handleDelete = (id: string) => {
    deleteFavoriteRequest(id, user?.id);
    loadFavorites();
    setDeleteConfirmId(null);
    showFeedback('تم حذف الطلب المفضل بنجاح');
  };

  const handleStartRename = (fav: FavoriteRequest) => {
    setEditingId(fav.id);
    setEditingTitle(fav.title);
  };

  const handleSaveRename = (id: string) => {
    if (!editingTitle.trim()) return;
    updateFavoriteRequestTitle(id, editingTitle.trim(), user?.id);
    loadFavorites();
    setEditingId(null);
    showFeedback('تم تحديث اسم الطلب المفضل');
  };

  const filteredFavorites = useMemo(() => {
    if (!searchTerm.trim()) return favorites;
    const term = searchTerm.toLowerCase().trim();
    return favorites.filter((fav) => {
      const matchTitle = fav.title?.toLowerCase().includes(term);
      const matchNotes = fav.notes?.toLowerCase().includes(term);
      const matchItems = fav.items?.some(
        (it) =>
          it.item_description.toLowerCase().includes(term) ||
          (it.specifications && it.specifications.toLowerCase().includes(term))
      );
      return matchTitle || matchNotes || matchItems;
    });
  }, [favorites, searchTerm]);

  return (
    <div className="space-y-6 max-w-7xl mx-auto px-2 sm:px-4 lg:px-6 py-4">
      {/* Header Banner */}
      <div className="rounded-2xl bg-gradient-to-r from-amber-950/40 via-slate-900 to-cyan-950/40 border border-amber-500/20 p-5 sm:p-6 shadow-xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 bg-amber-500/10 rounded-full blur-3xl pointer-events-none -mr-20 -mt-20"></div>
        <div className="relative z-10 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs font-bold mb-2">
              <span>⭐</span>
              <span>قوالب الطلبات المتكررة</span>
            </div>
            <h1 className="text-xl sm:text-2xl font-black text-slate-100 tracking-tight">
              الطلبات المفضلة
            </h1>
            <p className="text-xs sm:text-sm text-slate-400 mt-1 max-w-2xl leading-relaxed">
              احفظ الطلبات الدورية واستخدمها لإنشاء طلب شراء فوري بنقرة واحدة بنفس البنود والكميات، مع تخصيص المنطقة ورقم القطعة لكل موقع.
            </p>
          </div>

          <div className="flex items-center gap-2 sm:self-center shrink-0">
            <Link to="/requests/create">
              <Button variant="primary" size="md" className="gap-2 shadow-lg shadow-cyan-950/50">
                <span>➕</span>
                <span>إنشاء طلب شراء جديد</span>
              </Button>
            </Link>
          </div>
        </div>
      </div>

      {/* Feedback Alert */}
      {feedbackMessage && (
        <div className="p-3 bg-emerald-950/80 border border-emerald-500/40 rounded-xl text-emerald-300 text-xs font-bold flex items-center justify-between animate-fade-in shadow-lg">
          <div className="flex items-center gap-2">
            <span>✓</span>
            <span>{feedbackMessage}</span>
          </div>
          <button
            onClick={() => setFeedbackMessage(null)}
            className="text-emerald-400 hover:text-emerald-200 text-xs"
          >
            ✕
          </button>
        </div>
      )}

      {/* Search & Meta Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-900/60 p-3 rounded-xl border border-slate-800">
        <div className="relative flex-1 max-w-md">
          <input
            type="text"
            placeholder="بحث في الطلبات المفضلة والبنود..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-slate-950 border border-slate-700/80 rounded-lg pr-9 pl-4 py-2 text-xs sm:text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-amber-500/60 transition-colors"
          />
          <span className="absolute right-3 top-2.5 text-slate-500 text-sm">🔍</span>
          {searchTerm && (
            <button
              onClick={() => setSearchTerm('')}
              className="absolute left-3 top-2.5 text-slate-400 hover:text-slate-200 text-xs"
            >
              ✕
            </button>
          )}
        </div>

        <div className="flex items-center gap-2 text-xs text-slate-400 px-1">
          <span>إجمالي القوالب المحفوظة:</span>
          <span className="px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 font-mono font-black text-xs border border-amber-500/30">
            {favorites.length}
          </span>
        </div>
      </div>

      {/* Favorites List / Grid */}
      {filteredFavorites.length === 0 ? (
        <Card className="p-8 sm:p-12 text-center border-dashed border-slate-800 bg-slate-950/40">
          <div className="w-16 h-16 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-400 text-3xl flex items-center justify-center mx-auto mb-4 shadow-inner">
            ⭐
          </div>
          <h3 className="text-base sm:text-lg font-bold text-slate-200">
            {searchTerm ? 'لا توجد نتائج مطابقة لبحثك' : 'لا توجد طلبات مفضلة محفوظة بعد'}
          </h3>
          <p className="text-xs sm:text-sm text-slate-400 max-w-md mx-auto mt-2 leading-relaxed">
            {searchTerm
              ? 'جرّب البحث بكلمة أخرى أو مسح شريط البحث لعرض كل الطلبات المفضلة.'
              : 'يمكنك حفظ أي طلب في المفضلة بسهولة أثناء تعبئة طلب الشراء عن طريق النقر على زر "⭐ إرسال وحفظ في المفضلة" بجوار زر الإرسال.'}
          </p>
          <div className="mt-6 flex justify-center gap-3">
            {searchTerm ? (
              <Button variant="secondary" size="sm" onClick={() => setSearchTerm('')}>
                مسح البحث
              </Button>
            ) : (
              <Link to="/requests/create">
                <Button variant="primary" size="md">
                  بدء إنشاء طلب جديد
                </Button>
              </Link>
            )}
          </div>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
          {filteredFavorites.map((fav) => {
            const totalQty = fav.items.reduce((sum, it) => sum + (Number(it.quantity) || 0), 0);
            const isEditing = editingId === fav.id;
            const isConfirmingDelete = deleteConfirmId === fav.id;

            return (
              <div
                key={fav.id}
                className="flex flex-col justify-between rounded-2xl bg-slate-900/80 border border-slate-800 hover:border-amber-500/40 transition-all duration-200 p-4 sm:p-5 shadow-lg hover:shadow-amber-950/20 relative group"
              >
                <div>
                  {/* Card Header */}
                  <div className="flex items-start justify-between gap-2 mb-3">
                    <div className="flex-1 min-w-0">
                      {isEditing ? (
                        <div className="flex items-center gap-1.5">
                          <input
                            type="text"
                            value={editingTitle}
                            onChange={(e) => setEditingTitle(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && handleSaveRename(fav.id)}
                            className="bg-slate-950 border border-amber-500/60 rounded px-2 py-1 text-xs text-slate-100 font-bold w-full focus:outline-none"
                            autoFocus
                          />
                          <button
                            onClick={() => handleSaveRename(fav.id)}
                            className="text-emerald-400 hover:text-emerald-300 px-1.5 py-1 text-xs bg-emerald-950/60 rounded border border-emerald-700/50"
                            title="حفظ الاسم"
                          >
                            ✓
                          </button>
                          <button
                            onClick={() => setEditingId(null)}
                            className="text-slate-400 hover:text-slate-200 px-1.5 py-1 text-xs bg-slate-800 rounded border border-slate-700"
                            title="إلغاء"
                          >
                            ✕
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1.5">
                          <span className="text-amber-400 text-sm">⭐</span>
                          <h3 className="text-sm sm:text-base font-bold text-slate-100 truncate group-hover:text-amber-300 transition-colors">
                            {fav.title || 'طلب مفضل بدون عنوان'}
                          </h3>
                          <button
                            onClick={() => handleStartRename(fav)}
                            className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-amber-300 text-xs transition-opacity p-0.5"
                            title="تعديل المسمى"
                          >
                            ✏️
                          </button>
                        </div>
                      )}
                      <p className="text-[11px] text-slate-400 mt-1">
                        {new Date(fav.createdAt).toLocaleDateString('ar-EG', {
                          year: 'numeric',
                          month: 'short',
                          day: 'numeric',
                        })}
                      </p>
                    </div>

                    {/* Delete / Actions */}
                    <div className="shrink-0">
                      {isConfirmingDelete ? (
                        <div className="flex items-center gap-1 bg-rose-950/90 border border-rose-700/60 p-1 rounded-lg">
                          <span className="text-[10px] text-rose-300 font-bold px-1">تأكيد؟</span>
                          <button
                            onClick={() => handleDelete(fav.id)}
                            className="px-1.5 py-0.5 bg-rose-600 hover:bg-rose-500 text-white text-[10px] font-bold rounded"
                          >
                            نعم
                          </button>
                          <button
                            onClick={() => setDeleteConfirmId(null)}
                            className="px-1.5 py-0.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-[10px] rounded"
                          >
                            لا
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setDeleteConfirmId(fav.id)}
                          className="text-slate-400 hover:text-rose-400 transition-colors p-1 rounded hover:bg-slate-800/80 text-xs"
                          title="حذف من المفضلة"
                        >
                          🗑️
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Summary Pills */}
                  <div className="flex flex-wrap items-center gap-2 mb-3">
                    <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-md bg-cyan-950/60 border border-cyan-700/40 text-cyan-300">
                      <span>📦 {fav.items.length} أصناف</span>
                    </span>
                    <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-md bg-amber-950/60 border border-amber-700/40 text-amber-300">
                      <span>الكمية: {totalQty}</span>
                    </span>
                    {fav.priority && fav.priority !== 'NORMAL' && (
                      <span className={`inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-md ${
                        fav.priority === 'URGENT'
                          ? 'bg-rose-950/60 border border-rose-700/40 text-rose-300'
                          : 'bg-slate-800 border border-slate-700 text-slate-300'
                      }`}>
                        {fav.priority === 'URGENT' ? '🚨 عاجل' : 'منخفض'}
                      </span>
                    )}
                  </div>

                  {/* Items Preview List */}
                  <div className="space-y-1.5 rounded-xl bg-slate-950/60 border border-slate-800/80 p-2.5 mb-4 text-xs">
                    {fav.items.slice(0, 3).map((item, idx) => (
                      <div key={idx} className="flex items-center justify-between text-slate-300 gap-2">
                        <div className="truncate flex-1">
                          <span className="text-slate-500 font-mono ml-1.5">{idx + 1}.</span>
                          <span className="font-semibold">{item.item_description}</span>
                          {item.specifications && (
                            <span className="text-slate-400 text-[10px] mr-1 truncate">
                              ({item.specifications})
                            </span>
                          )}
                        </div>
                        <span className="shrink-0 font-mono text-amber-300 font-bold bg-amber-950/40 px-1.5 py-0.2 rounded border border-amber-800/30 text-[11px]">
                          {item.quantity} {item.uom || item.unit || 'قطعة'}
                        </span>
                      </div>
                    ))}
                    {fav.items.length > 3 && (
                      <div className="text-[10px] text-cyan-400 font-semibold text-center pt-1 border-t border-slate-800/60">
                        + {fav.items.length - 3} أصناف إضافية أخرى
                      </div>
                    )}
                  </div>

                  {/* Notes snippet */}
                  {fav.notes && (
                    <p className="text-[11px] text-slate-400 line-clamp-1 italic mb-3">
                      📝 {fav.notes}
                    </p>
                  )}
                </div>

                {/* Main Action Button */}
                <div className="pt-2 border-t border-slate-800/80">
                  <Button
                    type="button"
                    variant="primary"
                    size="sm"
                    onClick={() => handleUseFavorite(fav)}
                    className="w-full justify-center text-xs py-2 font-bold bg-gradient-to-r from-amber-600 via-amber-500 to-cyan-600 hover:from-amber-500 hover:to-cyan-500 text-slate-950 shadow-md shadow-amber-950/40"
                  >
                    <span>⚡ استخدام لإنشاء طلب شراء</span>
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default FavoriteRequestsPage;
