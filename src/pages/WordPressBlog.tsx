import { useEffect, useState } from "react";

import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { Button } from "@/components/ui/button";

interface WordPressBlogProps {
  adminLogin?: boolean;
}

const WordPressBlog = ({ adminLogin = false }: WordPressBlogProps) => {
  const wordpressUrl = adminLogin 
    ? "https://shahedalfahad19-xvmtl.wordpress.com/wp-login.php"
    : "https://shahedalfahad19-xvmtl.wordpress.com/";

// Types and state for public blog feed
  type WPPost = {
    id: number;
    slug: string;
    link: string;
    title: { rendered: string };
    excerpt: { rendered: string };
    content?: { rendered: string };
    date: string;
    featured_media: number;
    jetpack_featured_media_url?: string;
    _embedded?: {
      'wp:featuredmedia'?: Array<{
        source_url: string;
        alt_text: string;
      }>;
    };
  };

  const [posts, setPosts] = useState<WPPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Inject custom CSS to style the WordPress iframe content and set SEO tags
    const style = document.createElement('style');
    style.textContent = `
      .wordpress-iframe {
        width: 100%;
        min-height: calc(100vh - 80px);
        border: none;
        background: hsl(var(--background));
      }
      
      .wordpress-container {
        background: hsl(var(--background));
        color: hsl(var(--foreground));
        min-height: calc(100vh - 80px);
      }
      
      .wordpress-container.admin-mode {
        padding-top: 0;
        min-height: 100vh;
      }
      
      .wordpress-container.admin-mode .wordpress-iframe {
        min-height: 100vh;
      }
    `;
    document.head.appendChild(style);

    // Basic SEO without helmet
    const title = adminLogin ? "Blog Admin - PopupGenix" : "Blog - PopupGenix | Latest Insights & Updates";
    document.title = title;

    const ensureMeta = (attr: { name?: string; property?: string; }, content: string) => {
      const selector = attr.name ? `meta[name="${attr.name}"]` : `meta[property="${attr.property}"]`;
      let el = document.querySelector(selector) as HTMLMetaElement | null;
      if (!el) {
        el = document.createElement('meta');
        if (attr.name) el.setAttribute('name', attr.name);
        if (attr.property) el.setAttribute('property', attr.property);
        document.head.appendChild(el);
      }
      el.setAttribute('content', content);
    };

    ensureMeta({ name: 'description' }, adminLogin
      ? 'Admin login for PopupGenix blog management'
      : "Stay updated with the latest insights, tips, and industry updates from PopupGenix. Expert content on digital marketing, popup strategies, and business growth."
    );
    ensureMeta({ name: 'keywords' }, 'PopupGenix blog, digital marketing insights, popup strategies, business growth tips, marketing automation');
    ensureMeta({ property: 'og:title' }, title);
    ensureMeta({ property: 'og:description' }, adminLogin
      ? 'Admin login for PopupGenix blog management'
      : 'Stay updated with the latest insights and expert content from PopupGenix on digital marketing and business growth.'
    );
    ensureMeta({ property: 'og:type' }, 'website');
    ensureMeta({ name: 'twitter:card' }, 'summary_large_image');
    ensureMeta({ name: 'twitter:title' }, title);
    ensureMeta({ name: 'twitter:description' }, adminLogin
      ? 'Admin login for PopupGenix blog management'
      : 'Expert insights on digital marketing, popup strategies, and business growth from PopupGenix.'
    );

    const canonHref = `https://popupgenix.com${adminLogin ? '/blog/admin-login' : '/blog'}`;
    let linkCanon = document.querySelector('link[rel="canonical"]') as HTMLLinkElement | null;
    if (!linkCanon) {
      linkCanon = document.createElement('link');
      linkCanon.setAttribute('rel', 'canonical');
      document.head.appendChild(linkCanon);
    }
    linkCanon.setAttribute('href', canonHref);

    return () => {
      document.head.removeChild(style);
    };
  }, [adminLogin]);

  // Redirect admin login to open in WordPress (cannot be embedded due to X-Frame-Options)
  useEffect(() => {
    if (adminLogin) {
      window.location.href = wordpressUrl;
    }
  }, [adminLogin, wordpressUrl]);

  // Fetch public posts when not admin
  useEffect(() => {
    if (adminLogin) return;
    setLoading(true);
    fetch('https://public-api.wordpress.com/wp/v2/sites/shahedalfahad19-xvmtl.wordpress.com/posts?per_page=10&_embed=1')
      .then((res) => {
        if (!res.ok) throw new Error('Failed to load posts');
        return res.json();
      })
      .then((data: WPPost[]) => {
        setPosts(data);
        setError(null);
      })
      .catch((e: unknown) => {
        const msg = e instanceof Error ? e.message : 'Unknown error';
        setError(msg);
      })
      .finally(() => setLoading(false));
  }, [adminLogin]);

  const handleReadFullArticle = (post: WPPost) => {
    // Navigate to the individual blog post page using slug for SEO
    window.location.href = `/blog/${post.slug}`;
  };

  return (
    <div className="min-h-screen bg-background">
      {!adminLogin && <Header />}

      <main className={`wordpress-container ${!adminLogin ? 'pt-20' : ''}`}>
        {adminLogin ? (
          <section className="container mx-auto px-4 py-24 text-center">
            <h1 className="text-3xl font-semibold">Redirecting to WordPress login…</h1>
            <p className="mt-4 text-muted-foreground">
              If you are not redirected,
              <a href={wordpressUrl} target="_blank" rel="noopener" className="ml-1 underline text-primary">click here</a>.
            </p>
          </section>
        ) : (
          <section className="container mx-auto px-4 py-16">
            {/* Centered Blog Title with Gradient */}
            <div className="text-center mb-16">
              <h1 className="text-5xl font-bold bg-gradient-to-r from-primary via-accent to-primary-glow bg-clip-text text-transparent mb-4 animate-fade-in">
                PopupGenix Blog
              </h1>
              <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
                Stay updated with the latest insights, tips, and industry updates from our experts
              </p>
            </div>

            {loading && (
              <div className="text-center py-12">
                <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-primary border-r-transparent mb-4"></div>
                <p className="text-muted-foreground">Loading amazing content...</p>
              </div>
            )}
            
            {error && (
              <div className="text-center py-12">
                <p className="text-destructive text-lg">Failed to load posts: {error}</p>
              </div>
            )}

            {!loading && !error && (
              <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-3">
                {posts.map((post, index) => {
                  const imageUrl = post._embedded?.['wp:featuredmedia']?.[0]?.source_url || post.jetpack_featured_media_url || null;
                  const imageAlt = post._embedded?.['wp:featuredmedia']?.[0]?.alt_text || post.title.rendered;
                  const formattedDate = new Date(post.date).toLocaleDateString('en-US', {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric'
                  });

                  return (
                    <article 
                      key={post.id} 
                      className="group relative overflow-hidden rounded-xl bg-gradient-to-br from-card to-card/50 border border-border/50 hover:border-primary/50 transition-all duration-500 hover:shadow-[var(--shadow-neon)] hover:-translate-y-2 animate-fade-in"
                      style={{ animationDelay: `${index * 0.1}s` }}
                    >
                      {/* Featured Image */}
                      {imageUrl ? (
                        <div className="relative h-48 overflow-hidden">
                          <img
                            src={imageUrl}
                            alt={imageAlt}
                            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                            loading="lazy"
                            onError={(e) => {
                              const target = e.target as HTMLImageElement;
                              target.style.display = 'none';
                              const parent = target.parentElement;
                              if (parent) {
                                parent.innerHTML = `
                                  <div class="h-48 bg-gradient-to-br from-primary/20 to-accent/20 flex items-center justify-center">
                                    <div class="text-primary/60 text-6xl">📝</div>
                                  </div>
                                `;
                              }
                            }}
                          />
                          <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                        </div>
                      ) : (
                        <div className="h-48 bg-gradient-to-br from-primary/20 to-accent/20 flex items-center justify-center">
                          <div className="text-primary/60 text-6xl">📝</div>
                        </div>
                      )}

                      {/* Content */}
                      <div className="p-6 space-y-4">
                        {/* Date */}
                        <div className="text-sm text-muted-foreground font-medium">
                          {formattedDate}
                        </div>

                        {/* Title */}
                        <h2 className="text-xl font-bold group-hover:text-primary transition-colors duration-300 line-clamp-2">
                          <span dangerouslySetInnerHTML={{ __html: post.title.rendered }} />
                        </h2>

                        {/* Excerpt */}
                        <div 
                          className="text-muted-foreground line-clamp-3 prose prose-sm prose-invert max-w-none"
                          dangerouslySetInnerHTML={{ __html: post.excerpt.rendered || "Click to read this exciting post..." }}
                        />

                        {/* Read More Button */}
                        <div className="pt-4">
                          <Button 
                            onClick={() => handleReadFullArticle(post)}
                            variant="ghost"
                            className="inline-flex items-center gap-2 text-primary hover:text-primary-glow font-semibold transition-all duration-300 group/link p-0 h-auto"
                          >
                            Read Full Article
                            <svg 
                              className="w-4 h-4 transition-transform duration-300 group-hover/link:translate-x-1" 
                              fill="none" 
                              stroke="currentColor" 
                              viewBox="0 0 24 24"
                            >
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
                            </svg>
                          </Button>
                        </div>
                      </div>

                      {/* Hover Glow Effect */}
                      <div className="absolute inset-0 opacity-0 group-hover:opacity-20 transition-opacity duration-500 bg-gradient-to-r from-primary/20 via-accent/20 to-primary-glow/20 pointer-events-none" />
                    </article>
                  );
                })}
              </div>
            )}

            {/* No Posts Message */}
            {!loading && !error && posts.length === 0 && (
              <div className="text-center py-16">
                <div className="text-6xl mb-4">📝</div>
                <h3 className="text-2xl font-semibold mb-2">No Posts Yet</h3>
                <p className="text-muted-foreground">Check back soon for amazing content!</p>
              </div>
            )}
          </section>
        )}
      </main>

      {!adminLogin && <Footer />}

    </div>
  );
};

export default WordPressBlog;