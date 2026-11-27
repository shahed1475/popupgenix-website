import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Calendar, ExternalLink } from "lucide-react";
import "@/components/BlogContent.css";

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

const BlogPost = () => {
  const { slug } = useParams<{ slug: string }>();
  const [post, setPost] = useState<WPPost | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Content processing function to enhance WordPress HTML
  const processWordPressContent = (htmlContent: string): string => {
    let processedContent = htmlContent;
    
    // Replace WordPress-specific classes with semantic HTML
    processedContent = processedContent.replace(/class="wp-block-heading"/g, '');
    processedContent = processedContent.replace(/class="wp-block-list"/g, '');
    
    // Clean up excessive non-breaking spaces
    processedContent = processedContent.replace(/&nbsp;/g, ' ');
    
    // Clean up list items for better styling
    processedContent = processedContent.replace(
      /<li>/g, 
      '<li class="relative pl-2">'
    );
    
    return processedContent;
  };

  useEffect(() => {
    if (!slug) return;

    const fetchPost = async () => {
      setLoading(true);
      try {
        const response = await fetch(`https://public-api.wordpress.com/wp/v2/sites/shahedalfahad19-xvmtl.wordpress.com/posts?slug=${slug}&_embed=1`);
        if (!response.ok) throw new Error('Failed to load post');
        
        const postsData: WPPost[] = await response.json();
        if (postsData.length === 0) throw new Error('Post not found');
        const postData = postsData[0];
        setPost(postData);
        
        // Update SEO metadata
        document.title = `${postData.title.rendered} - PopupGenix Blog`;
        
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

        const excerpt = postData.excerpt.rendered.replace(/<[^>]*>/g, '').substring(0, 160);
        ensureMeta({ name: 'description' }, excerpt);
        ensureMeta({ property: 'og:title' }, postData.title.rendered);
        ensureMeta({ property: 'og:description' }, excerpt);
        ensureMeta({ property: 'og:type' }, 'article');
        
        const imageUrl = postData._embedded?.['wp:featuredmedia']?.[0]?.source_url || postData.jetpack_featured_media_url;
        if (imageUrl) {
          ensureMeta({ property: 'og:image' }, imageUrl);
          ensureMeta({ name: 'twitter:image' }, imageUrl);
        }

        setError(null);
      } catch (error) {
        console.error('Error loading post:', error);
        setError('Failed to load post');
      } finally {
        setLoading(false);
      }
    };

    fetchPost();
  }, [slug]);

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <main className="pt-20">
          <div className="container mx-auto px-4 py-16">
            <div className="text-center py-12">
              <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-primary border-r-transparent mb-4"></div>
              <p className="text-muted-foreground">Loading article...</p>
            </div>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  if (error || !post) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <main className="pt-20">
          <div className="container mx-auto px-4 py-16">
            <div className="text-center py-12">
              <h1 className="text-3xl font-bold mb-4">Post Not Found</h1>
              <p className="text-muted-foreground mb-8">Sorry, the requested article could not be found.</p>
              <Link to="/blog">
                <Button variant="hero">
                  <ArrowLeft className="w-4 h-4 mr-2" />
                  Back to Blog
                </Button>
              </Link>
            </div>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  const imageUrl = post._embedded?.['wp:featuredmedia']?.[0]?.source_url || post.jetpack_featured_media_url;
  const imageAlt = post._embedded?.['wp:featuredmedia']?.[0]?.alt_text || post.title.rendered;
  const formattedDate = new Date(post.date).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });

  return (
    <div className="min-h-screen bg-background">
      <Header />
      
      <main className="pt-20">
        <article className="container mx-auto px-4 py-16 max-w-4xl">
          {/* Back to Blog */}
          <div className="mb-8">
            <Link to="/blog">
              <Button variant="ghost" className="text-muted-foreground hover:text-primary">
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back to Blog
              </Button>
            </Link>
          </div>

          {/* Featured Image */}
          {imageUrl && (
            <div className="mb-8 rounded-xl overflow-hidden">
              <img
                src={imageUrl}
                alt={imageAlt}
                className="w-full h-64 md:h-96 object-cover"
                loading="lazy"
              />
            </div>
          )}

          {/* Article Header */}
          <header className="mb-8">
            <h1 
              className="text-3xl md:text-4xl lg:text-5xl font-bold mb-6 leading-tight bg-gradient-to-r from-foreground to-muted-foreground bg-clip-text text-transparent"
              dangerouslySetInnerHTML={{ __html: post.title.rendered }}
            />
            
            <div className="flex items-center space-x-4 text-muted-foreground">
              <div className="flex items-center space-x-2">
                <Calendar className="w-4 h-4" />
                <time dateTime={post.date}>{formattedDate}</time>
              </div>
            </div>
          </header>

          {/* Article Content */}
          <div 
            className="article-content prose prose-xl max-w-none
              /* Base Typography */
              prose-headings:font-bold prose-headings:text-foreground prose-headings:tracking-tight
              prose-h1:text-6xl prose-h1:leading-tight prose-h1:mb-8 prose-h1:mt-16 prose-h1:pb-6 prose-h1:border-b-2 prose-h1:border-gradient-primary
              prose-h2:text-5xl prose-h2:leading-snug prose-h2:mb-6 prose-h2:mt-14 prose-h2:text-primary prose-h2:font-semibold
              prose-h3:text-4xl prose-h3:leading-snug prose-h3:mb-5 prose-h3:mt-12 prose-h3:text-primary/90 prose-h3:font-medium
              prose-h4:text-3xl prose-h4:leading-snug prose-h4:mb-4 prose-h4:mt-10 prose-h4:text-primary/80 prose-h4:font-medium
              prose-h5:text-2xl prose-h5:leading-snug prose-h5:mb-4 prose-h5:mt-8 prose-h5:text-primary/70 prose-h5:font-medium
              prose-h6:text-xl prose-h6:leading-snug prose-h6:mb-3 prose-h6:mt-6 prose-h6:text-primary/60 prose-h6:font-medium
              
              /* Paragraph and Text */
              prose-p:text-foreground prose-p:leading-relaxed prose-p:mb-6 prose-p:text-lg prose-p:font-light
              prose-strong:text-foreground prose-strong:font-semibold prose-strong:bg-primary/10 prose-strong:px-1 prose-strong:rounded
              prose-em:text-muted-foreground prose-em:italic prose-em:font-medium
              
              /* Links */
              prose-a:text-primary prose-a:font-medium prose-a:no-underline prose-a:bg-primary/5 prose-a:px-1 prose-a:rounded prose-a:transition-all
              hover:prose-a:text-primary-glow hover:prose-a:bg-primary/10 hover:prose-a:underline
              
              /* Lists */
              prose-ul:my-8 prose-ul:space-y-3 prose-ul:pl-6
              prose-ol:my-8 prose-ol:space-y-3 prose-ol:pl-6 prose-ol:list-decimal
              prose-li:text-foreground prose-li:leading-relaxed prose-li:text-lg prose-li:font-light prose-li:relative prose-li:pl-2
              
              /* Blockquotes */
              prose-blockquote:text-muted-foreground prose-blockquote:border-l-4 prose-blockquote:border-l-primary 
              prose-blockquote:pl-8 prose-blockquote:italic prose-blockquote:bg-gradient-to-r prose-blockquote:from-muted/20 prose-blockquote:to-transparent
              prose-blockquote:py-6 prose-blockquote:rounded-r-xl prose-blockquote:my-8 prose-blockquote:text-xl prose-blockquote:font-medium
              
              /* Code */
              prose-code:text-primary prose-code:bg-muted prose-code:px-3 prose-code:py-1 prose-code:rounded-md prose-code:text-base prose-code:font-mono prose-code:font-medium
              prose-pre:bg-muted prose-pre:border prose-pre:border-border prose-pre:rounded-xl prose-pre:p-6 prose-pre:overflow-x-auto prose-pre:my-8
              
              /* Images */
              prose-img:rounded-2xl prose-img:shadow-2xl prose-img:border prose-img:border-border prose-img:my-10 prose-img:mx-auto
              
              /* Tables */
              prose-table:border-collapse prose-table:border prose-table:border-border prose-table:rounded-lg prose-table:overflow-hidden prose-table:my-8
              prose-th:border prose-th:border-border prose-th:bg-muted prose-th:p-4 prose-th:text-left prose-th:font-semibold prose-th:text-foreground
              prose-td:border prose-td:border-border prose-td:p-4 prose-td:text-foreground
              
              /* Horizontal Rules */
              prose-hr:border-border prose-hr:my-12 prose-hr:border-t-2"
            dangerouslySetInnerHTML={{ 
              __html: processWordPressContent(post.content?.rendered || post.excerpt.rendered)
            }}
          />

          {/* Article Footer */}
          <footer className="mt-12 pt-8 border-t border-border">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between space-y-4 sm:space-y-0">
              <div>
                <p className="text-sm text-muted-foreground mb-2">
                  Originally published on WordPress
                </p>
                <a 
                  href={post.link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center space-x-2 text-primary hover:text-primary-glow transition-colors"
                >
                  <span>View on WordPress</span>
                  <ExternalLink className="w-4 h-4" />
                </a>
              </div>
              
              <Link to="/blog">
                <Button variant="outline">
                  More Articles
                </Button>
              </Link>
            </div>
          </footer>
        </article>
      </main>

      <Footer />
    </div>
  );
};

export default BlogPost;