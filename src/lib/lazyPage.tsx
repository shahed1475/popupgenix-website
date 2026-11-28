import { lazy, type ComponentType } from "react";

// Like React.lazy, but once the page code has loaded it renders right away,
// without showing the empty loading frame. preload() starts the download early.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function lazyPage<P = any>(factory: () => Promise<{ default: ComponentType<P> }>) {
  let Loaded: ComponentType<P> | null = null;
  let pending: Promise<unknown> | null = null;
  const preload = () => {
    if (!pending) {
      pending = factory().then((m) => {
        Loaded = m.default;
        return m;
      });
      pending.catch(() => {
        pending = null;
      });
    }
    return pending;
  };
  const Lazy = lazy(() => preload() as Promise<{ default: ComponentType<P> }>);
  const Page = (props: P) => {
    const C = Loaded ?? Lazy;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return <C {...(props as any)} />;
  };
  Page.preload = preload;
  return Page;
}
