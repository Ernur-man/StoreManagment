import { useState, type FormEvent } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { Eye, EyeOff, LogIn, PackageCheck, ClipboardList, BarChart3, Languages } from 'lucide-react';
import { api, ApiError } from '../lib/api';
import { useAuthStore } from '../store/auth';
import { useI18n } from '../i18n';
import { Button, Field, Input } from '../components/ui';
import type { AuthUser } from '../lib/types';

const demoAccounts = [
  { email: 'admin@wishstock.app', labelKey: 'role.ADMIN' as const },
  { email: 'manager@wishstock.app', labelKey: 'role.MANAGER' as const },
  { email: 'employee@wishstock.app', labelKey: 'role.EMPLOYEE' as const },
];

export function Login() {
  const { t, language, setLanguage, error: translateError } = useI18n();
  const user = useAuthStore((state) => state.user);
  const setUser = useAuthStore((state) => state.setUser);
  const navigate = useNavigate();
  const [email, setEmail] = useState('admin@wishstock.app');
  const [password, setPassword] = useState('Demo1234!');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState('');

  if (user) return <Navigate to="/dashboard" replace />;

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setFormError('');
    try {
      const data = await api.post<{ user: AuthUser }>('/auth/login', { email, password });
      setUser(data.user);
      navigate('/dashboard', { replace: true });
    } catch (err) {
      setFormError(translateError(err instanceof ApiError ? err.messageKey : 'errors.invalidCredentials'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen bg-white">
      <div className="relative hidden w-[46%] flex-col justify-between overflow-hidden bg-[#121b36] p-12 text-white lg:flex">
        <div className="absolute -right-24 -top-24 h-96 w-96 rounded-full bg-indigo-500/20 blur-3xl" />
        <div className="absolute -bottom-32 -left-20 h-96 w-96 rounded-full bg-violet-500/10 blur-3xl" />
        <div className="relative flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-400 to-violet-500 text-xl font-black">W</div>
          <div>
            <p className="text-xl font-extrabold leading-none tracking-tight">{t('app.name')}</p>
            <p className="mt-1 text-[10px] font-bold uppercase tracking-[0.18em] text-indigo-300/70">{t('app.tagline')}</p>
          </div>
        </div>
        <div className="relative max-w-lg">
          <p className="mb-4 inline-flex items-center gap-2 rounded-full bg-indigo-500/20 px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider text-indigo-200">{t('common.demo')}</p>
          <h1 className="text-4xl font-extrabold leading-tight tracking-tight xl:text-5xl">{t('login.title')}</h1>
          <p className="mt-5 text-base leading-relaxed text-slate-300">{t('login.subtitle')}</p>
          <div className="mt-10 space-y-4">
            {[
              { icon: ClipboardList, text: t('nav.requests') },
              { icon: PackageCheck, text: t('nav.arrivals') },
              { icon: BarChart3, text: t('nav.analytics') },
            ].map((feature) => (
              <div key={feature.text} className="flex items-center gap-3 text-sm text-slate-200">
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/10"><feature.icon className="h-4 w-4 text-indigo-300" /></span>
                {feature.text}
              </div>
            ))}
          </div>
        </div>
        <p className="relative text-xs text-slate-500">{t('login.footer')}</p>
      </div>

      <div className="flex flex-1 flex-col px-5 py-5 sm:px-10">
        <div className="flex justify-end">
          <div className="flex items-center rounded-xl bg-slate-100 p-1">
            {(['en', 'ru'] as const).map((lang) => (
              <button key={lang} type="button" onClick={() => setLanguage(lang)} className={`flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-bold uppercase ${language === lang ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500'}`}>
                <Languages className="h-3 w-3" />{lang}
              </button>
            ))}
          </div>
        </div>

        <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center py-10">
          <h2 className="text-3xl font-extrabold tracking-tight text-slate-900">{t('login.welcome')}</h2>
          <p className="mt-2 text-sm text-slate-500">{t('login.subtitle')}</p>

          <form onSubmit={submit} className="mt-8 space-y-5">
            <Field label={t('login.email')}>
              <Input type="email" required autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="admin@wishstock.app" />
            </Field>
            <Field label={t('login.password')}>
              <div className="relative">
                <Input type={showPassword ? 'text' : 'password'} required autoComplete="current-password" minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} className="pr-12" />
                <button type="button" onClick={() => setShowPassword((v) => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700" aria-label={showPassword ? t('login.hidePassword') : t('login.showPassword')}>
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </Field>
            {formError && <p className="rounded-xl bg-red-50 px-3 py-2.5 text-sm text-red-700">{formError}</p>}
            <Button type="submit" variant="primary" className="w-full" disabled={busy} icon={<LogIn className="h-4 w-4" />}>
              {busy ? t('common.loading') : t('login.signIn')}
            </Button>
          </form>

          <div className="mt-10 border-t border-slate-100 pt-6">
            <p className="text-xs font-bold uppercase tracking-wider text-slate-400">{t('login.demoAccounts')}</p>
            <div className="mt-3 grid gap-2">
              {demoAccounts.map((account) => (
                <button
                  key={account.email}
                  type="button"
                  onClick={() => { setEmail(account.email); setPassword('Demo1234!'); setFormError(''); }}
                  className="flex items-center justify-between rounded-xl border border-slate-200 px-3 py-2.5 text-left text-sm hover:border-indigo-300 hover:bg-indigo-50/40"
                >
                  <div>
                    <p className="font-semibold text-slate-700">{account.email}</p>
                    <p className="text-xs text-slate-400">{t(account.labelKey)} · Demo1234!</p>
                  </div>
                  <span className="text-xs font-semibold text-indigo-600">{t('login.useAccount')}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
