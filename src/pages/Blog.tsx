import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, ExternalLink } from "lucide-react";
import Layout from "@/components/site/Layout";
import Seo from "@/components/Seo";
import { Container, Eyebrow } from "@/components/site/ui";
import NewsletterForm from "@/components/site/NewsletterForm";
import { featuredImage, fmtDate, listPosts, textOnly } from "@/lib/wordpress";
import { SITE, STATIC_ROUTES } from "@/lib/site";

const meta = STATIC_ROUTES.find((r) => r.path === "/blog")!;

export default function Blog() {
  const { data, isLoading, isError } = useQuery({ queryKey: ["wp-posts"], queryFn: () => listPosts(12), staleTime: 5 * 60_000 });

  return (
    <Layout>
      <Seo title={meta.title} description={meta.description} path="/blog" />
      <section className="py-20">
        <Container>
          <div className="mb-14 max-w-3xl">
            <Eyebrow>Blog</Eyebrow>
            <h1 className="text-4xl font-bold tracking-tight md:text-6xl">Notes on AI, automation and building software</h1>
            <p className="mt-5 text-lg text-muted-foreground">Practical writing from the PopupGenix team. Published from WordPress, so new posts appear here automatically.</p>
          </div>

          {isLoading && (
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3" aria-busy="true">
              {[0, 1, 2].map((i) => <div key={i} className="h-80 animate-pulse rounded-2xl bg-secondary" />)}
            </div>
          )}

          {isError && (
            <div className="rounded-2xl border border-border bg-card p-8 text-center">
              <p className="font-medium">We could not load the posts right now.</p>
              <a href={`https://${SITE.wordpress.site}`} target="_blank" rel="noopener noreferrer" className="mt-3 inline-flex items-center gap-1.5 text-sm text-primary">
                Read on WordPress <ExternalLink className="h-4 w-4" aria-hidden />
              </a>
            </div>
          )}

          {data && data.length === 0 && (
            <p className="rounded-2xl border border-border bg-card p-8 text-center text-muted-foreground">No posts yet. Subscribe below and we will let you know when the first one is out.</p>
          )}

          {data && data.length > 0 && (
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
              {data.map((p) => {
                const img = featuredImage(p);
                return (
                  <article key={p.id} className="group flex flex-col overflow-hidden rounded-2xl border border-border bg-card transition hover:-translate-y-1 hover:border-primary/40 hover:shadow-elegant">
                    <Link to={`/blog/${p.slug}`} className="flex flex-1 flex-col">
                      {img ? (
                        <img src={img} alt="" loading="lazy" width={800} height={450} className="aspect-video w-full object-cover" />
                      ) : (
                        <div className="aspect-video bg-gradient-to-br from-primary/20 to-secondary" aria-hidden />
                      )}
                      <div className="flex flex-1 flex-col p-6">
                        <time dateTime={p.date} className="text-xs text-muted-foreground">{fmtDate(p.date)}</time>
                        <h2 className="mt-2 text-xl font-semibold leading-snug" dangerouslySetInnerHTML={{ __html: textOnly(p.title.rendered) }} />
                        <p className="mt-3 line-clamp-3 flex-1 text-sm text-muted-foreground">{textOnly(p.excerpt.rendered)}</p>
                        <span className="mt-5 inline-flex items-center gap-1.5 text-sm font-medium text-primary">Read article <ArrowRight className="h-4 w-4" aria-hidden /></span>
                      </div>
                    </Link>
                  </article>
                );
              })}
            </div>
          )}

          <div className="mx-auto mt-20 max-w-xl rounded-2xl border border-border bg-card p-8">
            <h2 className="text-xl font-semibold">Get new posts by email</h2>
            <p className="mb-5 mt-2 text-sm text-muted-foreground">No spam. Unsubscribe any time.</p>
            <NewsletterForm source="blog" />
          </div>
        </Container>
      </section>
    </Layout>
  );
}
