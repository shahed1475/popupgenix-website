import { ReactNode } from "react";
import Header from "@/components/Header";
import Footer from "@/components/Footer";

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <Header />
      <main id="main" className="pt-16">{children}</main>
      <Footer />
    </div>
  );
}
