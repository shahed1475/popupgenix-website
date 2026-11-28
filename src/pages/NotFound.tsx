import { Link, useLocation } from "react-router-dom";
import { useEffect } from "react";
import { ArrowRight } from "lucide-react";
import Footer from "@/components/Footer";

const links = [
  { name: "Home", href: "/" },
  { name: "AI & Machine Learning", href: "/services/ai-machine-learning" },
  { name: "Custom Software", href: "/services/custom-software" },
  { name: "Web Development", href: "/services/web-development" },
  { name: "Mobile Apps", href: "/services/mobile-apps" },
  { name: "CRM & SaaS Tools", href: "/services/crm-saas" },
  { name: "Cloud & DevOps", href: "/services/cloud-devops" },
  { name: "Blog", href: "/blog" },
  { name: "Contact", href: "/contact" },
];

const NotFound = () => {
  const { pathname } = useLocation();

  useEffect(() => {
    document.title = "Page not found | PopupGenix";
  }, [pathname]);

  return (
    <div className="min-h-screen bg-background">
      <main id="main-content" className="px-6 pb-24 pt-36">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-primary">Error 404</p>
          <h1 className="mt-4 text-4xl font-black tracking-tight md:text-5xl">Page not found</h1>
          <p className="mt-4 text-muted-foreground">
            This page does not exist or has moved. Use one of the links below to find what you need.
          </p>
          <Link
            to="/"
            className="mt-8 inline-flex items-center gap-2 rounded-full bg-primary px-6 py-3 text-sm font-bold uppercase tracking-wider text-primary-foreground transition-opacity hover:opacity-90"
          >
            Back to Home <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
          <nav aria-label="Helpful pages" className="mt-12">
            <ul className="grid grid-cols-1 gap-3 text-left sm:grid-cols-2">
              {links.map((l) => (
                <li key={l.href}>
                  <Link
                    to={l.href}
                    className="flex items-center justify-between rounded-2xl border border-border px-5 py-3 text-sm font-medium text-foreground transition-colors hover:bg-secondary"
                  >
                    {l.name}
                    <ArrowRight className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        </div>
      </main>
      <Footer />
    </div>
  );
};

export default NotFound;
