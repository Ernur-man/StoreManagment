import { useEffect, useMemo, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  Bell, Boxes, ChevronLeft, ChevronRight, ClipboardList, LayoutDashboard, LogOut,
  Menu, PackageCheck, BarChart3, Settings, Users, Languages, X, CheckCheck, ShieldCheck, CreditCard,
} from 'lucide-react';
import { useAuthStore } from '../store/auth';
import { useI18n } from '../i18n';
import { api } from '../lib/api';
import { cn, formatRelative } from '../lib/utils';
import { Avatar } from './ui';
import type { AppNotification } from '../lib/types';
import { toast } from '../store/toast';

const navItems = [
  { to: '/dashboard', icon: LayoutDashboard, key: 'nav.dashboard' as const },
  { to: '/inventory', icon: Boxes, key: 'nav.inventory' as const },
  { to: '/requests', icon: ClipboardList, key: 'nav.requests' as const },
  { to: '/arrivals', icon: PackageCheck, key: 'nav.arrivals' as const },
  { to: '/customers', icon: Users, key: 'nav.customers' as const },
  { to: '/analytics', icon: BarChart3, key: 'nav.analytics' as const },
  { to: '/billing', icon: CreditCard, key: 'nav.billing' as const },
  { to: '/settings', icon: Settings, key: 'nav.settings' as const },
];

export function AppShell() {
  const { t, language, setLanguage, td, formatDate, error: translateError } = useI18n();
  const user = useAuthStore((state) => state.user);
  const clearAuth = useAuthStore((state) => state.clear);
  const navigate = useNavigate();
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [notificationOpen, setNotificationOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);

  const currentTitle = useMemo(
    () => navItems.find((item) => location.pathname.startsWith(item.to))?.key ?? 'nav.dashboard',
    [location.pathname],
  );

  async function loadNotifications() {
    try {
      const data = await api.get<{ notifications: AppNotification[] }>('/notifications');
      setNotifications(data.notifications);
    } catch {
      /* silent */
    }
  }

  useEffect(() => {
    void loadNotifications();
    const interval = window.setInterval(loadNotifications, 45_000);
    return () => window.clearInterval(interval);
  }, [location.pathname]);

  async function signOut() {
    try {
      await api.post('/auth/logout');
    } catch {
      /* ignore */
    }
    clearAuth();
    navigate('/login', { replace: true });
  }

  async function markAllRead() {
    try {
      await api.patch('/notifications/read-all');
      await loadNotifications();
    } catch (err) {
      toast.error(translateError((err as Error).message));
    }
  }

  function notificationTarget(notification: AppNotification | undefined): string {
    switch (notification?.entityType) {
      case 'PRODUCT_VARIANT': return '/inventory';
      case 'STOCK_ARRIVAL': return '/arrivals';
      case 'CUSTOMER_REQUEST': return '/requests';
      default: return notification?.type === 'SYSTEM' ? '/settings' : '/requests';
    }
  }

  async function markRead(id: string) {
    const notification = notifications.find((item) => item.id === id);
    try {
      await api.patch(`/notifications/${id}/read`);
      setNotifications((items) => items.map((n) => (n.id === id ? { ...n, read: true } : n)));
      navigate(notificationTarget(notification));
    } catch (err) {
      toast.error(translateError((err as Error).message));
    }
  }

  const unread = notifications.filter((n) => !n.read).length;

  function notificationText(notification: AppNotification) {
    try {
      const params = JSON.parse(notification.body) as Record<string, string | number>;
      if (notification.type === 'SYSTEM') return t('notifications.demoReadyBody');
      return t('notifications.stockMatchBody', { ...params, product: td(String(params.productName ?? '')) });
    } catch {
      return notification.body;
    }
  }

  return (
    <div className="min-h-screen bg-[#f6f8fc]">
      {mobileOpen && <div className="fixed inset-0 z-30 bg-slate-950/40 lg:hidden" onClick={() => setMobileOpen(false)} />}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-40 flex flex-col bg-[#121b36] text-white transition-all duration-200',
          collapsed ? 'w-[76px]' : 'w-[250px]',
          mobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0',
        )}
      >
        <div className="flex h-16 items-center gap-3 px-5">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-400 to-violet-500 text-lg font-black">W</div>
          {!collapsed && (
            <div className="overflow-hidden">
              <div className="text-lg font-extrabold leading-none tracking-tight">{t('app.name')}</div>
              <div className="mt-1 text-[9px] font-bold uppercase tracking-[0.18em] text-indigo-300/70">{t('app.tagline')}</div>
            </div>
          )}
          <button type="button" className="ml-auto text-slate-400 lg:hidden" onClick={() => setMobileOpen(false)} aria-label={t('common.close')}><X className="h-5 w-5" /></button>
        </div>

        <div className="mt-6 px-4 text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">{collapsed ? '•••' : t('nav.workspace')}</div>
        <nav className="mt-3 flex-1 space-y-1 px-3">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                onClick={() => setMobileOpen(false)}
                className={({ isActive }) => cn(
                  'flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition-colors',
                  isActive ? 'bg-indigo-500/20 text-white' : 'text-slate-400 hover:bg-white/5 hover:text-white',
                  collapsed && 'justify-center px-0',
                )}
                title={collapsed ? t(item.key) : undefined}
              >
                <Icon className="h-[18px] w-[18px] shrink-0" />
                {!collapsed && <span className="truncate">{t(item.key)}</span>}
              </NavLink>
            );
          })}
        </nav>

        <button
          type="button"
          onClick={() => setCollapsed((value) => !value)}
          className="mb-4 ml-4 hidden items-center gap-2 rounded-lg px-2 py-2 text-xs font-medium text-slate-500 hover:bg-white/5 hover:text-white lg:flex"
        >
          {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
          {!collapsed && t('nav.collapse')}
        </button>
      </aside>

      <div className={cn('transition-all duration-200', collapsed ? 'lg:pl-[76px]' : 'lg:pl-[250px]')}>
        <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-slate-200/80 bg-white/90 px-4 backdrop-blur-md sm:px-6">
          <button type="button" className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 lg:hidden" onClick={() => setMobileOpen(true)} aria-label={t('nav.menu')}><Menu className="h-5 w-5" /></button>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-bold text-slate-900">{t(currentTitle)}</p>
            <p className="hidden truncate text-[11px] text-slate-400 sm:block">{user?.store?.name ?? t('app.name')}</p>
          </div>

          <div className="flex items-center rounded-xl bg-slate-100 p-1" title={t('common.language')}>
            <Languages className="mx-1 hidden h-3.5 w-3.5 text-slate-400 sm:block" />
            {(['en', 'ru'] as const).map((lang) => (
              <button
                key={lang}
                type="button"
                onClick={() => setLanguage(lang)}
                className={cn('rounded-lg px-2.5 py-1 text-xs font-bold uppercase transition', language === lang ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-800')}
              >
                {lang}
              </button>
            ))}
          </div>

          <div className="relative">
            <button type="button" onClick={() => { setNotificationOpen((v) => !v); setUserMenuOpen(false); }} className="relative rounded-xl p-2.5 text-slate-500 hover:bg-slate-100" aria-label={t('notifications.title')}>
              <Bell className="h-5 w-5" />
              {unread > 0 && <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[9px] font-bold text-white">{unread}</span>}
            </button>
            {notificationOpen && (
              <>
                <div className="fixed inset-0 z-30" onClick={() => setNotificationOpen(false)} />
                <div className="absolute right-0 z-40 mt-2 w-[min(390px,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl">
                  <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
                    <p className="text-sm font-bold text-slate-900">{t('notifications.title')} <span className="ml-1 text-xs font-medium text-slate-400">{t('notifications.unread')}: {unread}</span></p>
                    <button type="button" onClick={markAllRead} className="inline-flex items-center gap-1 text-xs font-semibold text-indigo-600 hover:text-indigo-800"><CheckCheck className="h-3.5 w-3.5" />{t('notifications.markAllRead')}</button>
                  </div>
                  <div className="max-h-[400px] overflow-y-auto">
                    {notifications.length === 0 ? (
                      <p className="px-4 py-8 text-center text-sm text-slate-400">{t('notifications.noNotifications')}</p>
                    ) : notifications.map((notification) => (
                      <button key={notification.id} type="button" onClick={() => markRead(notification.id)} className={cn('block w-full border-b border-slate-50 px-4 py-3 text-left hover:bg-slate-50', !notification.read && 'bg-indigo-50/40')}>
                        <div className="flex items-center gap-2">
                          <span className={cn('h-2 w-2 rounded-full', notification.read ? 'bg-slate-300' : 'bg-indigo-500')} />
                          <p className="text-xs font-bold text-slate-800">{notification.type === 'SYSTEM' ? t('notifications.systemTitle') : t('notifications.stockMatchTitle')}</p>
                          <span className="ml-auto text-[10px] text-slate-400">{formatRelative(notification.createdAt, language)}</span>
                        </div>
                        <p className="mt-1.5 pl-4 text-xs leading-relaxed text-slate-600">{notificationText(notification)}</p>
                      </button>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>

          <div className="relative">
            <button type="button" onClick={() => { setUserMenuOpen((v) => !v); setNotificationOpen(false); }} className="flex items-center gap-2 rounded-xl p-1 hover:bg-slate-100">
              <Avatar name={user?.name ?? 'User'} size="sm" />
              <span className="hidden max-w-28 truncate text-xs font-semibold text-slate-700 sm:block">{user?.name}</span>
            </button>
            {userMenuOpen && (
              <>
                <div className="fixed inset-0 z-30" onClick={() => setUserMenuOpen(false)} />
                <div className="absolute right-0 z-40 mt-2 w-60 overflow-hidden rounded-2xl border border-slate-200 bg-white p-2 shadow-xl">
                  <div className="border-b border-slate-100 px-3 py-3">
                    <p className="text-sm font-bold text-slate-900">{user?.name}</p>
                    <p className="truncate text-xs text-slate-500">{user?.email}</p>
                    <p className="mt-1.5 flex items-center gap-1 text-[11px] font-semibold text-indigo-600"><ShieldCheck className="h-3 w-3" />{user ? t(`role.${user.role}`) : ''}</p>
                    {user?.lastLoginAt && <p className="mt-1 text-[10px] text-slate-400">{t('settings.lastLogin')}: {formatDate(user.lastLoginAt, true)}</p>}
                  </div>
                  <button type="button" onClick={() => { setUserMenuOpen(false); navigate('/settings'); }} className="mt-1 flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"><Settings className="h-4 w-4" />{t('common.settings')}</button>
                  <button type="button" onClick={signOut} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-red-600 hover:bg-red-50"><LogOut className="h-4 w-4" />{t('common.logout')}</button>
                </div>
              </>
            )}
          </div>
        </header>

        <main className="mx-auto w-full max-w-[1600px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
