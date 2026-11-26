import { ReactNode, Suspense, lazy, useEffect, useState } from "react";
import Header from "@/components/Header";
import Footer from "@/components/Footer";

const ChatWidget = lazy(() => import("@/components/site/ChatWidget"));

export default function Layout({ children }: { children: ReactNode }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return (
    <div className="min-h-screen bg-background text-foreground">
      <Header />
      <main id="main" className="pt-16">{children}</main>
      <Footer />
      {mounted && <Suspense fallback={null}><ChatWidget /></Suspense>}
    </div>
  );
}
