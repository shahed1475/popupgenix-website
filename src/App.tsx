import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { ThemeProvider } from "next-themes";

import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import Index from "./pages/Index";
import NotFound from "./pages/NotFound";
import ClientPortal from "./pages/ClientPortal";
import Portal from "./pages/Portal";
import AdminPanel from "./pages/AdminPanel";

import Contact from "./pages/Contact";
import BlogPost from "./pages/BlogPost";
import WordPressBlog from "./pages/WordPressBlog";
import PrivacyPolicy from "./pages/PrivacyPolicy";
import CookiePolicy from "./pages/CookiePolicy";
import Pricing from "./pages/Pricing";
import TermsAndConditions from "./pages/TermsAndConditions";
import RefundPolicy from "./pages/RefundPolicy";
import ScrollToHash from "@/components/ScrollToHash";

// Service Pages
import AIAndML from "./pages/services/AIAndML";
import CustomSoftware from "./pages/services/CustomSoftware";
import WebDevelopment from "./pages/services/WebDevelopment";
import MobileApps from "./pages/services/MobileApps";
import CRMAndSaaS from "./pages/services/CRMAndSaaS";
import CloudAndDevOps from "./pages/services/CloudAndDevOps";



const App = () => (
  <ThemeProvider attribute="class" defaultTheme="dark" enableSystem>
    <Toaster />
    <Sonner />
      <BrowserRouter>
        <ScrollToHash />
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
        
        <Route path="/client/*" element={<ClientPortal />} />
        <Route path="/portal/*" element={<Portal />} />
        <Route path="/admin/*" element={<AdminPanel />} />
        {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
        <Route path="*" element={<NotFound />} />
      </Routes>
    </BrowserRouter>
  </ThemeProvider>
);

export default App;
