'use client';

/**
 * Local compatibility layer for the handful of react-router-dom APIs used by
 * the preserved UI. It keeps the existing page/component source unchanged while
 * delegating navigation to the Next.js App Router.
 */
import {
  createContext,
  useContext,
  useEffect,
  type AnchorHTMLAttributes,
  type MouseEvent,
  type ReactNode,
} from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams as useNextSearchParams } from 'next/navigation';

const OutletContext = createContext<ReactNode>(null);

export function OutletProvider({ children, outlet }: { children: ReactNode; outlet: ReactNode }) {
  return <OutletContext.Provider value={outlet}>{children}</OutletContext.Provider>;
}

export function Outlet() {
  return <>{useContext(OutletContext)}</>;
}

interface NavigateFunction {
  (to: string, options?: { replace?: boolean }): void;
}

export function useNavigate(): NavigateFunction {
  const router = useRouter();
  return (to, options) => {
    if (options?.replace) router.replace(to);
    else router.push(to);
  };
}

export function useLocation() {
  const pathname = usePathname() ?? '/';
  const params = useNextSearchParams();
  const search = params?.toString() ?? '';
  return {
    pathname,
    search: search ? `?${search}` : '',
    hash: '',
    state: null,
    key: 'default',
  };
}

export function useSearchParams(): [URLSearchParams, (next: URLSearchParams | string) => void] {
  const params = useNextSearchParams();
  const router = useRouter();
  const pathname = usePathname() ?? '/';
  const setParams = (next: URLSearchParams | string) => {
    const query = typeof next === 'string' ? next : next.toString();
    router.replace(query ? `${pathname}?${query}` : pathname);
  };
  return [(params ?? new URLSearchParams()) as unknown as URLSearchParams, setParams];
}

export interface NavigateProps {
  to: string;
  replace?: boolean;
}

export function Navigate({ to, replace = true }: NavigateProps) {
  const router = useRouter();
  useEffect(() => {
    if (replace) router.replace(to);
    else router.push(to);
  }, [replace, router, to]);
  return null;
}

type LinkProps = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href'> & {
  to: string;
  replace?: boolean;
};

export function LinkCompat({ to, replace: _replace, ...props }: LinkProps) {
  return <Link href={to} {...props} />;
}

interface NavLinkRenderProps {
  isActive: boolean;
}

type NavLinkProps = Omit<LinkProps, 'className'> & {
  className?: string | ((props: NavLinkRenderProps) => string);
  end?: boolean;
};

export function NavLink({ to, className, end = false, ...props }: NavLinkProps) {
  const pathname = usePathname() ?? '/';
  const isActive = end ? pathname === to : pathname === to || pathname.startsWith(`${to}/`);
  const resolved = typeof className === 'function' ? className({ isActive }) : className;
  return <Link href={to} className={resolved} {...props} />;
}

export function BrowserRouter({ children }: { children: ReactNode }) {
  return <>{children}</>;
}

export function Routes({ children }: { children: ReactNode }) {
  return <>{children}</>;
}

export function Route(_props: { path?: string; element?: ReactNode; children?: ReactNode }) {
  return null;
}

// Preserve the original import name used by Dashboard and other pages.
export { LinkCompat as Link };

export function preventDefault(event: MouseEvent) {
  event.preventDefault();
}
