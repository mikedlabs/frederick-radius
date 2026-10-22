import { useContext, useMemo, type ReactNode } from "react";
import { LayoutRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime.js";
import { PathParamsContext } from "next/dist/shared/lib/hooks-client-context.shared-runtime.js";
// The extensionless real-package import deliberately bypasses the exact .js
// workshop alias and retains Vite's normal upstream CJS pre-bundling.
// No dependency file or production import is changed.
import { RedirectBoundary as UpstreamRedirectBoundary } from "next/dist/client/components/redirect-boundary";
export { RedirectErrorBoundary } from "next/dist/client/components/redirect-boundary";
import { storybookLayoutContext } from "./next-router-context";

export function RedirectBoundary({ children }: { children: ReactNode }) {
  const layout = useContext(LayoutRouterContext);
  const params = useContext(PathParamsContext);
  const current = useMemo(() => storybookLayoutContext(layout, params ?? {}), [layout, params]);
  return <LayoutRouterContext.Provider value={current}><UpstreamRedirectBoundary>{children}</UpstreamRedirectBoundary></LayoutRouterContext.Provider>;
}
