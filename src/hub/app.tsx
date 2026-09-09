import { AppProvider } from "_/app";

import Shell from "~/components/Shell";

import "./styles.css";

/**
 * The global wrapper, rendered around every route including 404.
 *
 * `AppProvider` is KosmoJS's seam - with TanStack Query enabled it supplies
 * the query client, and the shell below can use hooks because it renders
 * inside it. The shell then owns the session gate and the impersonation
 * banner, so no page has to.
 */
export default function App() {
  return (
    <AppProvider>
      <Shell />
    </AppProvider>
  );
}
