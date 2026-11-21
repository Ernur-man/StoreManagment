import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { Boxes, Eye, Pencil, Plus, Trash2, Package, AlertTriangle } from 'lucide-react';
import { api } from '../lib/api';
import { useI18n } from '../i18n';
import {
  Button, Card, EmptyState, Field, Input, Modal, PageHeader, Select, Table, TableWrap, Textarea, Badge,
} from '../components/ui';
import { AvailabilityBadge } from '../components/Badges';
import { availabilityFor, cn } from '../lib/utils';
import { toast } from '../store/toast';
import type { Product, Variant } from '../lib/types';

interface VariantForm {
  id?: string;
  sku: string;
  size: string;
  color: string;
  price: string;
  quantity: string;
  lowStockThreshold: string;
}
interface ProductForm {
  name: string;
  sku: string;
  category: string;
  brand: string;
  description: string;
  imageUrl: string;
  isActive: boolean;
  variants: VariantForm[];
}

const emptyVariant = (): VariantForm => ({ sku: '', size: '', color: '', price: '0', quantity: '0', lowStockThreshold: '3' });
const emptyForm = (): ProductForm => ({ name: '', sku: '', category: '', brand: '', description: '', imageUrl: '', isActive: true, variants: [emptyVariant()] });

interface Meta { categories: string[]; sizes: string[]; colors: string[]; brands: string[] }

export function Inventory() {
  const { t, td, formatDate, formatMoney, error: translateError } = useI18n();
  const [products, setProducts] = useState<Product[]>([]);
  const [meta, setMeta] = useState<Meta>({ categories: [], sizes: [], colors: [], brands: [] });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('ALL');
  const [size, setSize] = useState('ALL');
  const [color, setColor] = useState('ALL');
  const [availability, setAvailability] = useState('ALL');
  const [sort, setSort] = useState('newest');
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const [form, setForm] = useState<ProductForm>(emptyForm());
  const [viewing, setViewing] = useState<Product | null>(null);
  const [deleting, setDeleting] = useState<Product | null>(null);
  const [adjusting, setAdjusting] = useState<Variant | null>(null);
  const [adjustValue, setAdjustValue] = useState('0');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [productsData, metaData] = await Promise.all([
        api.get<{ products: Product[] }>('/products'),
        api.get<Meta>('/products/meta'),
      ]);
      setProducts(productsData.products);
      setMeta(metaData);
    } catch (err) {
      toast.error(translateError((err as Error).message));
    } finally {
      setLoading(false);
    }
  }, [translateError]);

  useEffect(() => { void load(); }, [load]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const result = products.filter((product) => {
      if (q && ![product.name, product.sku, product.brand ?? '', ...product.variants.map((v) => v.sku)].some((v) => v.toLowerCase().includes(q))) return false;
      if (category !== 'ALL' && product.category !== category) return false;
      if (size !== 'ALL' && !product.variants.some((v) => v.size === size)) return false;
      if (color !== 'ALL' && !product.variants.some((v) => v.color === color)) return false;
      if (availability !== 'ALL' && !product.variants.some((v) => v.availability === availability)) return false;
      return true;
    });
    result.sort((a, b) => {
      if (sort === 'name') return a.name.localeCompare(b.name);
      if (sort === 'price') return Math.max(...b.variants.map((v) => v.price)) - Math.max(...a.variants.map((v) => v.price));
      if (sort === 'quantity') return a.variants.reduce((s, v) => s + (v.quantity ?? 0), 0) - b.variants.reduce((s, v) => s + (v.quantity ?? 0), 0);
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
    return result;
  }, [products, search, category, size, color, availability, sort]);

  function openForm(product?: Product) {
    if (product) {
      setEditing(product);
      setForm({
        name: product.name, sku: product.sku, category: product.category, brand: product.brand ?? '',
        description: product.description ?? '', imageUrl: product.imageUrl ?? '', isActive: product.isActive,
        variants: product.variants.map((v) => ({
          id: v.id, sku: v.sku, size: v.size, color: v.color, price: String(v.price),
          quantity: String(v.quantity ?? 0), lowStockThreshold: String(v.lowStockThreshold),
        })),
      });
    } else {
      setEditing(null);
      setForm(emptyForm());
    }
    setFormOpen(true);
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    try {
      const payload = {
        ...form,
        brand: form.brand || null,
        description: form.description || null,
        imageUrl: form.imageUrl || null,
        variants: form.variants.map((v) => ({
          ...(v.id ? { id: v.id } : {}),
          sku: v.sku, size: v.size, color: v.color, price: Number(v.price),
          quantity: Number(v.quantity), lowStockThreshold: Number(v.lowStockThreshold),
        })),
      };
      if (editing) await api.patch(`/products/${editing.id}`, payload);
      else await api.post('/products', payload);
      toast.success(t('common.saved'));
      setFormOpen(false);
      await load();
    } catch (err) {
      toast.error(translateError((err as Error).message));
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!deleting) return;
    try {
      await api.delete(`/products/${deleting.id}`);
      toast.success(t('common.deleted'));
      setDeleting(null);
      setViewing(null);
      await load();
    } catch (err) {
      toast.error(translateError((err as Error).message));
    }
  }

  async function saveAdjustment() {
    if (!adjusting) return;
    try {
      await api.patch(`/products/variants/${adjusting.id}/inventory`, { quantity: Number(adjustValue) });
      toast.success(t('common.saved'));
      setAdjusting(null);
      await load();
    } catch (err) {
      toast.error(translateError((err as Error).message));
    }
  }

  const totalStock = (product: Product) => product.variants.reduce((sum, v) => sum + (v.quantity ?? 0), 0);

  return (
    <div>
      <PageHeader
        eyebrow={t('nav.inventory')}
        title={t('inventory.title')}
        subtitle={t('inventory.subtitle')}
        actions={<Button variant="primary" onClick={() => openForm()} icon={<Plus className="h-4 w-4" />}>{t('inventory.addProduct')}</Button>}
      />

      <Card className="mb-5 p-3">
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-6">
          <Input placeholder={t('inventory.searchPlaceholder')} value={search} onChange={(e) => setSearch(e.target.value)} className="lg:col-span-2" />
          <Select value={category} onChange={(e) => setCategory(e.target.value)}><option value="ALL">{t('inventory.allCategories')}</option>{meta.categories.map((v) => <option key={v} value={v}>{td(v)}</option>)}</Select>
          <Select value={size} onChange={(e) => setSize(e.target.value)}><option value="ALL">{t('inventory.allSizes')}</option>{meta.sizes.map((v) => <option key={v} value={v}>{v}</option>)}</Select>
          <Select value={color} onChange={(e) => setColor(e.target.value)}><option value="ALL">{t('inventory.allColors')}</option>{meta.colors.map((v) => <option key={v} value={v}>{td(v)}</option>)}</Select>
          <Select value={availability} onChange={(e) => setAvailability(e.target.value)}>
            <option value="ALL">{t('inventory.allAvailability')}</option>
            {(['IN_STOCK', 'LOW_STOCK', 'OUT_OF_STOCK'] as const).map((v) => <option key={v} value={v}>{t(`availability.${v}`)}</option>)}
          </Select>
        </div>
        <div className="mt-2 flex items-center justify-between px-1 text-xs text-slate-400">
          <span>{filtered.length} {t('common.product').toLowerCase()}</span>
          <Select value={sort} onChange={(e) => setSort(e.target.value)} className="w-auto border-0 bg-transparent py-1 text-xs font-semibold text-slate-500">
            <option value="newest">{t('inventory.sortNewest')}</option>
            <option value="name">{t('inventory.sortName')}</option>
            <option value="price">{t('inventory.sortPrice')}</option>
            <option value="quantity">{t('inventory.sortQuantity')}</option>
          </Select>
        </div>
      </Card>

      {loading ? <div className="py-16 text-center text-sm text-slate-500">{t('common.loading')}</div> : filtered.length === 0 ? (
        <Card><EmptyState icon={<Boxes className="h-5 w-5" />} title={t('inventory.noProducts')} description={t('inventory.noProductsSub')} action={<Button variant="primary" onClick={() => openForm()}>{t('inventory.addProduct')}</Button>} /></Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {filtered.map((product) => {
            const total = totalStock(product);
            const low = product.variants.some((v) => v.availability === 'LOW_STOCK');
            return (
              <Card key={product.id} className="card-hover overflow-hidden">
                <div className="flex gap-3 p-4">
                  <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-slate-100 text-lg font-extrabold text-indigo-500">
                    {product.imageUrl ? <img src={product.imageUrl} alt="" className="h-full w-full object-cover" /> : product.name.slice(0, 2).toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-bold text-slate-900">{td(product.name)}</p>
                    <p className="text-xs text-slate-400">{product.sku} · {td(product.category)}</p>
                    <p className="mt-1 text-xs text-slate-500">{product.brand ?? '—'}</p>
                  </div>
                  {low && <AlertTriangle className="h-4 w-4 shrink-0 text-amber-500" />}
                </div>
                <div className="flex flex-wrap gap-1.5 px-4 pb-3">
                  {product.variants.slice(0, 5).map((v) => (
                    <span key={v.id} className={cn('rounded-lg px-2 py-1 text-[10px] font-semibold ring-1 ring-inset',
                      v.availability === 'IN_STOCK' ? 'bg-emerald-50 text-emerald-700 ring-emerald-100' : v.availability === 'LOW_STOCK' ? 'bg-amber-50 text-amber-700 ring-amber-100' : 'bg-red-50 text-red-700 ring-red-100')}>
                      {v.size} / {td(v.color)} · {v.quantity}
                    </span>
                  ))}
                  {product.variants.length > 5 && <span className="rounded-lg bg-slate-100 px-2 py-1 text-[10px] text-slate-500">+{product.variants.length - 5}</span>}
                </div>
                <div className="flex items-center justify-between border-t border-slate-100 bg-slate-50/50 px-4 py-3">
                  <div>
                    <p className="text-[10px] uppercase tracking-wider text-slate-400">{t('inventory.totalStock')}</p>
                    <p className="text-sm font-bold text-slate-800">{total} {t('common.pcs')}</p>
                  </div>
                  <div className="flex gap-1">
                    <button type="button" title={t('common.view')} className="rounded-lg p-2 text-slate-400 hover:bg-white hover:text-indigo-600" onClick={() => setViewing(product)}><Eye className="h-4 w-4" /></button>
                    <button type="button" title={t('common.edit')} className="rounded-lg p-2 text-slate-400 hover:bg-white hover:text-indigo-600" onClick={() => openForm(product)}><Pencil className="h-4 w-4" /></button>
                    <button type="button" title={t('common.delete')} className="rounded-lg p-2 text-slate-400 hover:bg-white hover:text-red-600" onClick={() => setDeleting(product)}><Trash2 className="h-4 w-4" /></button>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Create / edit */}
      <Modal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title={editing ? t('inventory.editProduct') : t('inventory.newProduct')}
        subtitle={t('inventory.subtitle')}
        wide
        footer={<>
          <Button onClick={() => setFormOpen(false)}>{t('common.cancel')}</Button>
          <Button variant="primary" onClick={save} disabled={saving}>{saving ? t('common.loading') : t('common.save')}</Button>
        </>}
      >
        <form onSubmit={save} className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={`${t('common.name')} *`}><Input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
            <Field label={`${t('inventory.baseSku')} *`}><Input required value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })} /></Field>
            <Field label={`${t('common.category')} *`}><Input required list="category-list" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} /><datalist id="category-list">{meta.categories.map((c) => <option key={c} value={c} />)}</datalist></Field>
            <Field label={t('common.brand')}><Input value={form.brand} onChange={(e) => setForm({ ...form, brand: e.target.value })} /></Field>
            <Field label={t('inventory.imageUrl')} className="sm:col-span-2"><Input value={form.imageUrl} onChange={(e) => setForm({ ...form, imageUrl: e.target.value })} placeholder="https://…" /></Field>
            <Field label={t('inventory.description')} className="sm:col-span-2"><Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></Field>
            <label className="flex items-center gap-2 text-sm text-slate-600"><input type="checkbox" checked={form.isActive} onChange={(e) => setForm({ ...form, isActive: e.target.checked })} className="h-4 w-4 rounded accent-indigo-600" />{t('common.active')}</label>
          </div>

          <div className="border-t border-slate-100 pt-4">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-800">{t('inventory.variants')} ({form.variants.length})</h3>
              <Button size="sm" variant="soft" onClick={() => setForm({ ...form, variants: [...form.variants, emptyVariant()] })} icon={<Plus className="h-3.5 w-3.5" />}>{t('inventory.addVariant')}</Button>
            </div>
            <div className="space-y-3">
              {form.variants.map((variant, index) => (
                <div key={index} className="grid gap-2 rounded-xl border border-slate-200 p-3 sm:grid-cols-6">
                  <Field label={t('inventory.variantSku')}><Input required value={variant.sku} onChange={(e) => setForm({ ...form, variants: form.variants.map((v, i) => i === index ? { ...v, sku: e.target.value } : v) })} /></Field>
                  <Field label={t('common.size')}><Input required value={variant.size} onChange={(e) => setForm({ ...form, variants: form.variants.map((v, i) => i === index ? { ...v, size: e.target.value } : v) })} /></Field>
                  <Field label={t('common.color')}><Input required value={variant.color} onChange={(e) => setForm({ ...form, variants: form.variants.map((v, i) => i === index ? { ...v, color: e.target.value } : v) })} /></Field>
                  <Field label={t('inventory.variantPrice')}><Input required type="number" min="0" step="0.01" value={variant.price} onChange={(e) => setForm({ ...form, variants: form.variants.map((v, i) => i === index ? { ...v, price: e.target.value } : v) })} /></Field>
                  <Field label={t('inventory.variantQuantity')}><Input required type="number" min="0" value={variant.quantity} onChange={(e) => setForm({ ...form, variants: form.variants.map((v, i) => i === index ? { ...v, quantity: e.target.value } : v) })} /></Field>
                  <div className="flex items-end gap-2">
                    <Field label={t('inventory.lowStockThreshold')} className="flex-1"><Input type="number" min="0" value={variant.lowStockThreshold} onChange={(e) => setForm({ ...form, variants: form.variants.map((v, i) => i === index ? { ...v, lowStockThreshold: e.target.value } : v) })} /></Field>
                    {form.variants.length > 1 && <button type="button" onClick={() => setForm({ ...form, variants: form.variants.filter((_, i) => i !== index) })} className="mb-0.5 rounded-lg p-2 text-red-500 hover:bg-red-50"><Trash2 className="h-4 w-4" /></button>}
                  </div>
                </div>
              ))}
            </div>
          </div>
          <button type="submit" className="hidden" />
        </form>
      </Modal>

      {/* View */}
      <Modal open={Boolean(viewing)} onClose={() => setViewing(null)} title={t('inventory.productDetails')} subtitle={viewing?.sku} wide footer={<>
        <Button variant="danger" onClick={() => { setDeleting(viewing); }} icon={<Trash2 className="h-4 w-4" />}>{t('common.delete')}</Button>
        <Button onClick={() => { if (viewing) openForm(viewing); }} icon={<Pencil className="h-4 w-4" />}>{t('common.edit')}</Button>
      </>}>
        {viewing && (
          <div className="space-y-5">
            <div className="flex gap-4">
              <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-slate-100 text-xl font-extrabold text-indigo-500">{viewing.imageUrl ? <img src={viewing.imageUrl} alt="" className="h-full w-full object-cover" /> : viewing.name.slice(0, 2).toUpperCase()}</div>
              <div className="grid flex-1 gap-1 text-sm sm:grid-cols-2">
                <p><span className="text-slate-400">{t('common.category')}:</span> <span className="font-semibold">{td(viewing.category)}</span></p>
                <p><span className="text-slate-400">{t('common.brand')}:</span> <span className="font-semibold">{viewing.brand ?? '—'}</span></p>
                <p><span className="text-slate-400">{t('common.dateAdded')}:</span> <span className="font-semibold">{formatDate(viewing.createdAt)}</span></p>
                <p><span className="text-slate-400">{t('common.lastUpdated')}:</span> <span className="font-semibold">{formatDate(viewing.updatedAt)}</span></p>
                {viewing.description && <p className="sm:col-span-2 text-slate-600">{viewing.description}</p>}
              </div>
            </div>
            <TableWrap>
              <Table headers={[t('inventory.variantSku'), t('common.size'), t('common.color'), t('common.price'), t('common.quantity'), t('inventory.stockStatus'), '']}>
                {viewing.variants.map((v) => (
                  <tr key={v.id}>
                    <td className="px-4 py-3 font-medium text-slate-700">{v.sku}</td>
                    <td className="px-4 py-3 text-slate-600">{v.size}</td>
                    <td className="px-4 py-3 text-slate-600">{td(v.color)}</td>
                    <td className="px-4 py-3 text-slate-600">{formatMoney(v.price)}</td>
                    <td className="px-4 py-3 font-semibold text-slate-800">{v.quantity}</td>
                    <td className="px-4 py-3">{v.availability && <AvailabilityBadge status={v.availability} />}</td>
                    <td className="px-4 py-3"><button type="button" className="text-xs font-semibold text-indigo-600 hover:underline" onClick={() => { setAdjusting(v); setAdjustValue(String(v.quantity ?? 0)); }}>{t('inventory.adjustStock')}</button></td>
                  </tr>
                ))}
              </Table>
            </TableWrap>
            <div className="flex gap-4 text-xs text-slate-500">
              <span><Badge className="bg-slate-100 text-slate-600">{t('inventory.requested')}</Badge> {viewing._count?.requests ?? 0}</span>
              <span><Package className="inline h-3.5 w-3.5" /> {t('inventory.variants')}: {viewing.variants.length}</span>
            </div>
          </div>
        )}
      </Modal>

      {/* Delete confirm */}
      <Modal open={Boolean(deleting)} onClose={() => setDeleting(null)} title={t('common.delete')} subtitle={deleting?.name} footer={<>
        <Button onClick={() => setDeleting(null)}>{t('common.cancel')}</Button>
        <Button variant="danger" onClick={remove}>{t('common.delete')}</Button>
      </>}>
        <p className="text-sm text-slate-600">{t('inventory.deleteConfirm')}</p>
      </Modal>

      {/* Stock adjustment */}
      <Modal open={Boolean(adjusting)} onClose={() => setAdjusting(null)} title={t('inventory.adjustStock')} subtitle={adjusting ? `${adjusting.sku} · ${adjusting.size} / ${td(adjusting.color)}` : ''} footer={<>
        <Button onClick={() => setAdjusting(null)}>{t('common.cancel')}</Button>
        <Button variant="primary" onClick={saveAdjustment}>{t('common.save')}</Button>
      </>}>
        <Field label={t('inventory.variantQuantity')}><Input type="number" min="0" value={adjustValue} onChange={(e) => setAdjustValue(e.target.value)} /></Field>
        {adjusting && <p className="mt-2 text-xs text-slate-400">{t(`availability.${availabilityFor(Number(adjustValue), adjusting.lowStockThreshold)}`)}</p>}
      </Modal>
    </div>
  );
}
