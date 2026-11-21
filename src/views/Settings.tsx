import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Globe2, Info, Pencil, Plus, ShieldCheck, Trash2, Users } from 'lucide-react';
import { api } from '../lib/api';
import { useI18n } from '../i18n';
import {
  Avatar, Button, Card, EmptyState, Field, Input, Modal, PageHeader, SectionTitle, Select, Table, TableWrap,
} from '../components/ui';
import { toast } from '../store/toast';
import { useAuthStore } from '../store/auth';
import type { AuditLog, AuthUser, Role, StoreSettings } from '../lib/types';

interface StoreForm {
  name: string;
  currency: string;
  address: string;
  phone: string;
  email: string;
  lowStockThreshold: string;
}

interface UserForm {
  name: string;
  email: string;
  password: string;
  role: Role;
  active: boolean;
}

const emptyUserForm = (): UserForm => ({ name: '', email: '', password: '', role: 'EMPLOYEE', active: true });
const roles: Role[] = ['ADMIN', 'MANAGER', 'EMPLOYEE'];

export function Settings() {
  const { t, language, setLanguage, formatDate, error: translateError } = useI18n();
  const currentUser = useAuthStore((state) => state.user);
  const isAdmin = currentUser?.role === 'ADMIN';
  const canManage = isAdmin || currentUser?.role === 'MANAGER';
  const selectableRoles = isAdmin ? roles : roles.filter((role) => role !== 'ADMIN');
  const [store, setStore] = useState<StoreSettings | null>(null);
  const [storeForm, setStoreForm] = useState<StoreForm | null>(null);
  const [users, setUsers] = useState<AuthUser[]>([]);
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingStore, setSavingStore] = useState(false);
  const [userFormOpen, setUserFormOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<AuthUser | null>(null);
  const [userForm, setUserForm] = useState<UserForm>(emptyUserForm());
  const [savingUser, setSavingUser] = useState(false);
  const [deletingUser, setDeletingUser] = useState<AuthUser | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [storeData, usersData] = await Promise.all([
        api.get<{ store: StoreSettings }>('/settings/store'),
        api.get<{ users: AuthUser[] }>('/settings/users'),
      ]);
      setStore(storeData.store);
      setStoreForm({
        name: storeData.store.name,
        currency: storeData.store.currency,
        address: storeData.store.address ?? '',
        phone: storeData.store.phone ?? '',
        email: storeData.store.email ?? '',
        lowStockThreshold: String(storeData.store.lowStockThreshold),
      });
      setUsers(usersData.users);
      if (canManage) {
        try {
          const auditData = await api.get<{ logs: AuditLog[] }>('/settings/audit');
          setLogs(auditData.logs);
        } catch { /* audit is optional for managers without permission */ }
      }
    } catch (err) {
      toast.error(translateError((err as Error).message));
    } finally {
      setLoading(false);
    }
  }, [canManage, translateError]);

  useEffect(() => { void load(); }, [load]);

  async function saveStore(event: FormEvent) {
    event.preventDefault();
    if (!storeForm) return;
    setSavingStore(true);
    try {
      const data = await api.patch<{ store: StoreSettings }>('/settings/store', {
        ...storeForm,
        lowStockThreshold: Number(storeForm.lowStockThreshold),
      });
      setStore(data.store);
      toast.success(t('common.saved'));
    } catch (err) {
      toast.error(translateError((err as Error).message));
    } finally {
      setSavingStore(false);
    }
  }

  function openUserForm(user?: AuthUser) {
    if (!isAdmin && user?.role === 'ADMIN') {
      toast.error(t('settings.errors.adminOnly'));
      return;
    }
    setEditingUser(user ?? null);
    setUserForm(user ? {
      name: user.name, email: user.email, password: '', role: user.role, active: user.active,
    } : emptyUserForm());
    setUserFormOpen(true);
  }

  async function saveUser(event: FormEvent) {
    event.preventDefault();
    if (!isAdmin && (userForm.role === 'ADMIN' || editingUser?.role === 'ADMIN')) {
      toast.error(t('settings.errors.adminOnly'));
      return;
    }
    if (!isAdmin && editingUser && editingUser.id !== currentUser?.id && userForm.password) {
      toast.error(t('settings.errors.adminOnly'));
      return;
    }
    setSavingUser(true);
    try {
      if (editingUser) {
        // An empty password means "keep the current one"; omit it so Zod does not reject it.
        await api.patch(`/settings/users/${editingUser.id}`, {
          ...userForm,
          password: userForm.password || undefined,
        });
      } else {
        await api.post('/settings/users', userForm);
      }
      toast.success(editingUser ? t('common.saved') : t('settings.userCreated'));
      setUserFormOpen(false);
      await load();
    } catch (err) {
      toast.error(translateError((err as Error).message));
    } finally {
      setSavingUser(false);
    }
  }

  async function removeUser() {
    if (!deletingUser) return;
    if (!isAdmin && deletingUser.role === 'ADMIN') {
      toast.error(t('settings.errors.adminOnly'));
      setDeletingUser(null);
      return;
    }
    try {
      await api.delete(`/settings/users/${deletingUser.id}`);
      toast.success(t('common.deleted'));
      setDeletingUser(null);
      await load();
    } catch (err) {
      toast.error(translateError((err as Error).message));
    }
  }

  if (loading || !store || !storeForm) {
    return <div className="py-16 text-center text-sm text-slate-500">{t('common.loading')}</div>;
  }

  return (
    <div>
      <PageHeader eyebrow={t('nav.settings')} title={t('settings.title')} subtitle={t('settings.subtitle')} />

      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <SectionTitle title={t('settings.storeProfile')} subtitle={store.code} />
          <form onSubmit={saveStore} className="grid gap-4 px-5 pb-5 sm:grid-cols-2">
            <Field label={t('settings.storeName')}>
              <Input required disabled={!canManage} value={storeForm.name} onChange={(e) => setStoreForm({ ...storeForm, name: e.target.value })} />
            </Field>
            <Field label={t('settings.currency')}>
              <Input required maxLength={10} disabled={!canManage} value={storeForm.currency} onChange={(e) => setStoreForm({ ...storeForm, currency: e.target.value.toUpperCase() })} />
            </Field>
            <Field label={t('common.phone')}>
              <Input disabled={!canManage} value={storeForm.phone} onChange={(e) => setStoreForm({ ...storeForm, phone: e.target.value })} />
            </Field>
            <Field label={t('common.email')}>
              <Input type="email" disabled={!canManage} value={storeForm.email} onChange={(e) => setStoreForm({ ...storeForm, email: e.target.value })} />
            </Field>
            <Field label={t('settings.address')} className="sm:col-span-2">
              <Input disabled={!canManage} value={storeForm.address} onChange={(e) => setStoreForm({ ...storeForm, address: e.target.value })} />
            </Field>
            <Field label={t('settings.lowStockThreshold')}>
              <Input type="number" min={0} max={1000} disabled={!canManage} value={storeForm.lowStockThreshold} onChange={(e) => setStoreForm({ ...storeForm, lowStockThreshold: e.target.value })} />
            </Field>
            {canManage && (
              <div className="flex items-end sm:justify-end">
                <Button type="submit" variant="primary" disabled={savingStore}>{t('settings.saveSettings')}</Button>
              </div>
            )}
          </form>
        </Card>

        <div className="space-y-6">
          <Card>
            <SectionTitle title={t('settings.languageCard')} subtitle={t('settings.languageDesc')} />
            <div className="flex items-center gap-3 px-5 pb-5">
              <Globe2 className="h-5 w-5 text-indigo-500" />
              <div className="flex items-center rounded-xl bg-slate-100 p-1">
                {(['en', 'ru'] as const).map((lang) => (
                  <button
                    key={lang}
                    type="button"
                    onClick={() => setLanguage(lang)}
                    className={`rounded-lg px-4 py-2 text-xs font-bold uppercase ${language === lang ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500'}`}
                  >
                    {lang}
                  </button>
                ))}
              </div>
            </div>
          </Card>

          <Card>
            <SectionTitle title={t('settings.demoCard')} />
            <div className="flex items-start gap-3 px-5 pb-5">
              <Info className="mt-0.5 h-5 w-5 shrink-0 text-sky-500" />
              <p className="text-sm leading-relaxed text-slate-600">{t('settings.demoDesc')}</p>
            </div>
          </Card>
        </div>
      </div>

      <Card className="mt-6 overflow-hidden">
        <SectionTitle
          title={t('settings.users')}
          action={canManage ? <Button size="sm" variant="primary" icon={<Plus className="h-3.5 w-3.5" />} onClick={() => openUserForm()}>{t('settings.addUser')}</Button> : undefined}
        />
        <TableWrap>
          <Table headers={[t('common.name'), t('common.email'), t('settings.role'), t('common.status'), t('settings.lastLogin'), ...(canManage ? [t('common.actions')] : [])]}>
            {users.map((user) => (
              <tr key={user.id} className="hover:bg-slate-50/60">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    <Avatar name={user.name} size="sm" />
                    <span className="text-sm font-semibold text-slate-800">{user.name}</span>
                    {user.id === currentUser?.id && <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-[10px] font-bold text-indigo-600">YOU</span>}
                  </div>
                </td>
                <td className="px-4 py-3 text-sm text-slate-600">{user.email}</td>
                <td className="px-4 py-3 text-sm text-slate-600"><span className="inline-flex items-center gap-1"><ShieldCheck className="h-3.5 w-3.5 text-indigo-500" />{t(`role.${user.role}`)}</span></td>
                <td className="px-4 py-3 text-sm text-slate-600">{t(user.active ? 'common.active' : 'common.inactive')}</td>
                <td className="whitespace-nowrap px-4 py-3 text-sm text-slate-600">{formatDate(user.lastLoginAt, true)}</td>
                {canManage && (
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1">
                      <Button size="sm" variant="ghost" icon={<Pencil className="h-3.5 w-3.5" />} onClick={() => openUserForm(user)} disabled={!isAdmin && user.role === 'ADMIN'}>{t('common.edit')}</Button>
                      <Button size="sm" variant="ghost" icon={<Trash2 className="h-3.5 w-3.5" />} onClick={() => setDeletingUser(user)} disabled={user.id === currentUser?.id || (!isAdmin && user.role === 'ADMIN')}>{t('common.delete')}</Button>
                    </div>
                  </td>
                )}
              </tr>
            ))}
          </Table>
        </TableWrap>
      </Card>

      {canManage && (
        <Card className="mt-6 overflow-hidden">
          <SectionTitle title={t('settings.auditLog')} />
          {logs.length === 0 ? (
            <EmptyState icon={<Users className="h-6 w-6" />} title={t('common.noData')} />
          ) : (
            <TableWrap>
              <Table headers={[t('settings.action'), t('settings.entity'), t('common.employee'), t('settings.when')]}>
                {logs.map((log) => (
                  <tr key={log.id}>
                    <td className="px-4 py-3 text-sm font-medium text-slate-700">{log.action}</td>
                    <td className="px-4 py-3 text-sm text-slate-600">{log.entityType}</td>
                    <td className="px-4 py-3 text-sm text-slate-600">{log.user?.name ?? '—'}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-sm text-slate-600">{formatDate(log.createdAt, true)}</td>
                  </tr>
                ))}
              </Table>
            </TableWrap>
          )}
        </Card>
      )}

      <Modal
        open={userFormOpen}
        onClose={() => setUserFormOpen(false)}
        title={editingUser ? t('common.edit') : t('settings.addUser')}
        footer={<>
          <Button variant="secondary" onClick={() => setUserFormOpen(false)}>{t('common.cancel')}</Button>
          <Button type="submit" form="user-form" variant="primary" disabled={savingUser}>{t('common.save')}</Button>
        </>}
      >
        <form id="user-form" onSubmit={saveUser} className="grid gap-4 sm:grid-cols-2">
          <Field label={t('common.name')} className="sm:col-span-2">
            <Input required value={userForm.name} onChange={(e) => setUserForm({ ...userForm, name: e.target.value })} />
          </Field>
          <Field label={t('common.email')}>
            <Input required type="email" value={userForm.email} onChange={(e) => setUserForm({ ...userForm, email: e.target.value })} />
          </Field>
          <Field label={t('settings.role')}>
            <Select value={userForm.role} onChange={(e) => setUserForm({ ...userForm, role: e.target.value as Role })}>
              {selectableRoles.map((role) => <option key={role} value={role}>{t(`role.${role}`)}</option>)}
            </Select>
          </Field>
          <Field label={editingUser ? t('settings.newPassword') : t('settings.password')} className="sm:col-span-2">
            <Input
              type="password"
              minLength={8}
              required={!editingUser}
              disabled={Boolean(editingUser && !isAdmin && editingUser.id !== currentUser?.id)}
              value={userForm.password}
              onChange={(e) => setUserForm({ ...userForm, password: e.target.value })}
            />
            {editingUser && !isAdmin && editingUser.id !== currentUser?.id && (
              <p className="mt-1 text-xs text-slate-500">{t('settings.errors.adminOnlyNote')}</p>
            )}
          </Field>
          <label className="flex items-center gap-2 sm:col-span-2">
            <input type="checkbox" checked={userForm.active} onChange={(e) => setUserForm({ ...userForm, active: e.target.checked })} className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500" />
            <span className="text-sm text-slate-700">{t('common.active')}</span>
          </label>
        </form>
      </Modal>

      <Modal
        open={Boolean(deletingUser)}
        onClose={() => setDeletingUser(null)}
        title={t('common.delete')}
        subtitle={deletingUser?.name}
        footer={<>
          <Button variant="secondary" onClick={() => setDeletingUser(null)}>{t('common.cancel')}</Button>
          <Button variant="danger" onClick={() => void removeUser()}>{t('common.confirm')}</Button>
        </>}
      >
        <p className="text-sm text-slate-600">{t('common.confirm')}</p>
      </Modal>
    </div>
  );
}
