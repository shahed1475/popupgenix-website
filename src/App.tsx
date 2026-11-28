import { lazy, Suspense, useEffect, useRef } from "react";
import { afterIdle } from "@/lib/capability";
import { lazyPage } from "@/lib/lazyPage";
import { LazyMotion, MotionConfig, domMax } from "framer-motion";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { ThemeProvider } from "next-themes";

import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import Index from "./pages/Index";
const NotFound = lazyPage(() => import("./pages/NotFound"));
const Portal = lazyPage(() => import("./pages/Portal"));
const AdminPanel = lazyPage(() => import("./pages/AdminPanel"));

const Contact = lazyPage(() => import("./pages/Contact"));
const BlogPost = lazyPage(() => import("./pages/BlogPost"));
const WordPressBlog = lazyPage(() => import("./pages/WordPressBlog"));
const PrivacyPolicy = lazyPage(() => import("./pages/PrivacyPolicy"));
const CookiePolicy = lazyPage(() => import("./pages/CookiePolicy"));
const TermsAndConditions = lazyPage(() => import("./pages/TermsAndConditions"));
const RefundPolicy = lazyPage(() => import("./pages/RefundPolicy"));
import ScrollToHash from "@/components/ScrollToHash";
const ChatWidget = lazy(() => import("@/components/ChatWidget"));

// Service Pages
const AIAndML = lazyPage(() => import("./pages/services/AIAndML"));
const CustomSoftware = lazyPage(() => import("./pages/services/CustomSoftware"));
const WebDevelopment = lazyPage(() => import("./pages/services/WebDevelopment"));
const MobileApps = lazyPage(() => import("./pages/services/MobileApps"));
const CRMAndSaaS = lazyPage(() => import("./pages/services/CRMAndSaaS"));
const CloudAndDevOps = lazyPage(() => import("./pages/services/CloudAndDevOps"));
import { RouteMeta } from "./components/RouteMeta";
import Header from "./components/Header";



// A short fade-in when you move between pages. Skipped on the very first page
// (so it never delays the first paint) and for people who prefer less motion.
const RouteFade = ({ children }: { children: React.ReactNode }) => {
  const { pathname } = useLocation();
  const first = useRef(true);
  const animate = !first.current;
  useEffect(() => {
    first.current = false;
  }, []);
  return (
    <div key={pathname} className={animate ? "route-fade" : undefined}>
      {children}
    </div>
  );
};

// Keeps layout stable while a route chunk arrives — no spinner flash, no CLS.
const RouteFallback = () => <div className="min-h-screen bg-background" />;

// One navbar for the whole site. It lives outside the page fade, so it never
// disappears or jumps while you move between pages.
const SiteHeader = () => {
  const { pathname } = useLocation();
  if (pathname.startsWith("/admin") || pathname.startsWith("/portal") || pathname === "/blog/admin-login") return null;
  return <Header />;
};

// The assistant is for visitors, not for signed-in clients or staff.
const ChatGate = () => {
  const { pathname } = useLocation();
  if (pathname.startsWith("/admin") || pathname.startsWith("/portal")) return null;
  return (
    <Suspense fallback={null}>
      <ChatWidget />
    </Suspense>
  );
};

// Warm every public page in the background after the first screen is idle, so
// tapping a link opens the next page instantly instead of waiting for its code.
const prefetchPages = () => {
  const conn = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
  if (conn?.saveData) return;
  const loaders = [Contact, WordPressBlog, BlogPost, AIAndML, CustomSoftware, WebDevelopment,
    MobileApps, CRMAndSaaS, CloudAndDevOps, PrivacyPolicy, TermsAndConditions, RefundPolicy, CookiePolicy];
  loaders.forEach((page, i) => setTimeout(() => { page.preload().catch(() => {}); }, i * 150));
  fetch("https://public-api.wordpress.com/wp/v2/sites/shahedalfahad19-xvmtl.wordpress.com/posts?per_page=10&_embed=1")
    .then((r) => (r.ok ? r.json() : null))
    .then((d) => { if (Array.isArray(d)) localStorage.setItem("pgx-blog-posts-v1", JSON.stringify(d)); })
    .catch(() => {});
};

// Load the code for the page the visitor opened before React starts, so the
// pre-built page stays on screen instead of flashing an empty frame.
export function preloadRoute(pathname: string): Promise<unknown> {
  const p = pathname.replace(/\/+$/, "") || "/";
  const map: Record<string, { preload: () => Promise<unknown> }> = {
    "/contact": Contact, "/blog": WordPressBlog, "/privacy": PrivacyPolicy,
    "/terms-and-conditions": TermsAndConditions, "/refund-policy": RefundPolicy, "/cookie-policy": CookiePolicy,
    "/services/ai-machine-learning": AIAndML, "/services/custom-software": CustomSoftware,
    "/services/web-development": WebDevelopment, "/services/mobile-apps": MobileApps,
    "/services/crm-saas": CRMAndSaaS, "/services/cloud-devops": CloudAndDevOps,
  };
  const page = map[p] ?? (p.startsWith("/blog/") ? BlogPost : p.startsWith("/portal") ? Portal : p.startsWith("/admin") ? AdminPanel : null);
  return page ? page.preload().catch(() => {}) : Promise.resolve();
}

const App = () => {
  useEffect(() => afterIdle(prefetchPages, 3000), []);
  return (
  <ThemeProvider attribute="class" defaultTheme="dark" enableSystem>
    <MotionConfig reducedMotion="user">
      <LazyMotion features={domMax} strict>
    <Toaster />
    <Sonner />
      <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <ScrollToHash />
        <RouteMeta />
        <SiteHeader />
        <Suspense fallback={<RouteFallback />}>
        <RouteFade>
        <Routes>
        <Route path="/" element={<Index />} />
        <Route path="/contact" element={<Contact />} />
        <Route path="/pricing" element={<Navigate to="/" replace />} />
         <Route path="/blog" element={<WordPressBlog />} />
         <Route path="/blog/:slug" element={<BlogPost />} />
         <Route path="/blog/admin-login" element={<WordPressBlog adminLogin={true} />} />
        <Route path="/privacy" element={<PrivacyPolicy />} />
        <Route path="/privacy-policy" element={<Navigate to="/privacy" replace />} />
        <Route path="/terms-and-conditions" element={<TermsAndConditions />} />
        <Route path="/refund-policy" element={<RefundPolicy />} />
        <Route path="/cookie-policy" element={<CookiePolicy />} />
        
        {/* Service Pages */}
        <Route path="/services/ai-machine-learning" element={<AIAndML />} />
        <Route path="/services/custom-software" element={<CustomSoftware />} />
        <Route path="/services/web-development" element={<WebDevelopment />} />
        <Route path="/services/mobile-apps" element={<MobileApps />} />
        <Route path="/services/crm-saas" element={<CRMAndSaaS />} />
        <Route path="/services/cloud-devops" element={<CloudAndDevOps />} />
        
        <Route path="/portal/*" element={<Portal />} />
        <Route path="/admin/*" element={<AdminPanel />} />
        {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
        <Route path="*" element={<NotFound />} />
      </Routes>
        </RouteFade>
        </Suspense>
        <ChatGate />
    </BrowserRouter>
      </LazyMotion>
    </MotionConfig>
  </ThemeProvider>
  );
};

export default App;
