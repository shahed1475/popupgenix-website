// Self-hosted Inter variable: same origin, preloadable, no third-party
// connection, and we control font-display. Replaces the Google Fonts CDN link.
import '@fontsource-variable/inter'
import { createRoot } from 'react-dom/client'
import App, { preloadRoute } from './App.tsx'
import './index.css'

// Keep the pre-built HTML visible until this page's code is ready (max 4 s).
Promise.race([preloadRoute(window.location.pathname), new Promise((r) => setTimeout(r, 4000))]).finally(() => {
  createRoot(document.getElementById("root")!).render(<App />);
});

// After a new deploy, a page that was already open can ask for a file that no
// longer exists. Reload once to get the fresh version instead of a blank page.
window.addEventListener("vite:preloadError", () => {
  try {
    if (sessionStorage.getItem("pgx-reloaded")) return;
    sessionStorage.setItem("pgx-reloaded", "1");
  } catch {
    /* storage can be blocked; reload anyway once per page load */
  }
  window.location.reload();
});
