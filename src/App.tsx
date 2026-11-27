import { lazy, Suspense } from "react";
import { LazyMotion, MotionConfig, domMax } from "framer-motion";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { ThemeProvider } from "next-themes";

import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import Index from "./pages/Index";
const NotFound = lazy(() => import("./pages/NotFound"));
const Portal = lazy(() => import("./pages/Portal"));
const AdminPanel = lazy(() => import("./pages/AdminPanel"));

const Contact = lazy(() => import("./pages/Contact"));
const BlogPost = lazy(() => import("./pages/BlogPost"));
const WordPressBlog = lazy(() => import("./pages/WordPressBlog"));
const PrivacyPolicy = lazy(() => import("./pages/PrivacyPolicy"));
const CookiePolicy = lazy(() => import("./pages/CookiePolicy"));
const Pricing = lazy(() => import("./pages/Pricing"));
const TermsAndConditions = lazy(() => import("./pages/TermsAndConditions"));
const RefundPolicy = lazy(() => import("./pages/RefundPolicy"));
import ScrollToHash from "@/components/ScrollToHash";
const ChatWidget = lazy(() => import("@/components/ChatWidget"));

// Service Pages
const AIAndML = lazy(() => import("./pages/services/AIAndML"));
const CustomSoftware = lazy(() => import("./pages/services/CustomSoftware"));
const WebDevelopment = lazy(() => import("./pages/services/WebDevelopment"));
const MobileApps = lazy(() => import("./pages/services/MobileApps"));
const CRMAndSaaS = lazy(() => import("./pages/services/CRMAndSaaS"));
const CloudAndDevOps = lazy(() => import("./pages/services/CloudAndDevOps"));
import { RouteMeta } from "./components/RouteMeta";



// Keeps layout stable while a route chunk arrives — no spinner flash, no CLS.
const RouteFallback = () => <div className="min-h-screen bg-background" />;

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

const App = () => (
  <ThemeProvider attribute="class" defaultTheme="dark" enableSystem>
    <MotionConfig reducedMotion="user">
      <LazyMotion features={domMax} strict>
    <Toaster />
    <Sonner />
      <BrowserRouter>
        <ScrollToHash />
        <RouteMeta />
        <Suspense fallback={<RouteFallback />}>
        <Routes>
        <Route path="/" element={<Index />} />
        <Route path="/contact" element={<Contact />} />
        <Route path="/pricing" element={<Pricing />} />
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
        </Suspense>
        <ChatGate />
    </BrowserRouter>
      </LazyMotion>
    </MotionConfig>
  </ThemeProvider>
);

export default App;
