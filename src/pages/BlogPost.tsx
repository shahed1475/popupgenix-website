import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import Layout from "@/components/site/Layout";
import Seo from "@/components/Seo";
import { Container, CtaBand } from "@/components/site/ui";
import NewsletterForm from "@/components/site/NewsletterForm";
import { cleanHtml, featuredImage, fmtDate, getPost, readingMinutes, textOnly } from "@/lib/wordpress";
import { SITE } from "@/lib/site";
import NotFound from "@/pages/NotFound";
import "@/components/BlogContent.css";

export default function BlogPost() {
  const { slug = "" } = useParams();
  const { data: post, isLoading, isError } = useQuery({ queryKey: ["wp-post", slug], queryFn: () => getPost(slug), staleTime: 5 * 60_000 });

  if (isLoading) {
    return <Layout><Container className="py-32"><div className="h-96 animate-pulse rounded-2xl bg-secondary" aria-busy="true" /></Container></Layout>;
  }
  if (isError || !post) return <NotFound />;

  const title = textOnly(post.title.rendered);
  const desc = textOnly(post.excerpt.rendered).slice(0, 160);
  const img = featuredImage(post);

  return (
    <Layout>
      <Seo
        title={title}
        description={desc}
        path={`/blog/${post.slug}`}
        image={img.startsWith("/") ? `${SITE.url}${img}` : img}
        type="article"
        jsonLd={{
          "@context": "https://schema.org",
          "@type": "BlogPosting",
          headline: title,
          datePublished: post.date,
          dateModified: post.modified,
          image: img.startsWith("/") ? `${SITE.url}${img}` : img,
          author: { "@type": "Organization", name: SITE.name },
          publisher: { "@type": "Organization", name: SITE.name, logo: { "@type": "ImageObject", url: `${SITE.url}/popupgenix-logo.svg` } },
          mainEntityOfPage: `${SITE.url}/blog/${post.slug}`,
        }}
      />
      <article className="py-16">
        <Container className="max-w-3xl">
          <Link to="/blog" className="mb-8 inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-4 w-4" aria-hidden /> All posts
          </Link>
          <h1 className="text-3xl font-bold leading-tight tracking-tight md:text-5xl">{title}</h1>
          <p className="mt-4 text-sm text-muted-foreground">
            <time dateTime={post.date}>{fmtDate(post.date)}</time> · {readingMinutes(post.content.rendered)} min read
          </p>
          {<img src={img} alt="" width={1200} height={630} className="mt-8 w-full rounded-2xl" />}
          <div className="blog-content mt-10" dangerouslySetInnerHTML={{ __html: cleanHtml(post.content.rendered) }} />
          <div className="mt-16 rounded-2xl border border-border bg-card p-8">
            <h2 className="text-xl font-semibold">Enjoyed this? Get the next one by email.</h2>
            <div className="mt-5"><NewsletterForm source="post" /></div>
          </div>
        </Container>
      </article>
      <CtaBand />
    </Layout>
  );
}
