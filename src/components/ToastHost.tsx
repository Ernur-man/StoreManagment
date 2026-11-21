import { CheckCircle2, Info, XCircle, X } from 'lucide-react';
import { useToastStore } from '../store/toast';

export function ToastHost() {
  const toasts = useToastStore((state) => state.toasts);
  const remove = useToastStore((state) => state.remove);
  if (toasts.length === 0) return null;
  return (
    <div className="pointer-events-none fixed bottom-5 right-5 z-[60] flex w-[min(380px,calc(100vw-2rem))] flex-col gap-2">
      {toasts.map((item) => {
        const Icon = item.kind === 'success' ? CheckCircle2 : item.kind === 'error' ? XCircle : Info;
        return (
          <div key={item.id} className="pointer-events-auto flex items-start gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-lg">
            <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${item.kind === 'success' ? 'text-emerald-600' : item.kind === 'error' ? 'text-red-600' : 'text-indigo-600'}`} />
            <p className="flex-1 text-sm text-slate-700">{item.message}</p>
            <button type="button" onClick={() => remove(item.id)} className="text-slate-400 hover:text-slate-700"><X className="h-4 w-4" /></button>
          </div>
        );
      })}
    </div>
  );
}
