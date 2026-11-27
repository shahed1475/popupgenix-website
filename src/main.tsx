// Self-hosted Inter variable: same origin, preloadable, no third-party
// connection, and we control font-display. Replaces the Google Fonts CDN link.
import '@fontsource-variable/inter'
import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import './index.css'

createRoot(document.getElementById("root")!).render(<App />);
