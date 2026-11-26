import { Link } from "react-router-dom";
import Layout from "@/components/site/Layout";
import Seo from "@/components/Seo";
import { ButtonLink, Container } from "@/components/site/ui";

const NotFound = () => (
  <Layout>
    <Seo title="Page not found" description="The page you are looking for does not exist." noindex />
    <Container className="flex min-h-[60vh] flex-col items-center justify-center py-24 text-center">
      <p className="text-sm font-semibold uppercase tracking-[0.2em] text-primary">404</p>
      <h1 className="mt-4 text-4xl font-bold tracking-tight md:text-5xl">This page does not exist</h1>
      <p className="mt-4 max-w-md text-muted-foreground">It may have moved. Try the links below or head back to the home page.</p>
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <ButtonLink to="/">Back to home</ButtonLink>
        <ButtonLink to="/services" variant="ghost">Services</ButtonLink>
      </div>
      <p className="mt-6 text-sm text-muted-foreground"><Link to="/contact" className="text-primary underline">Contact us</Link> if something looks broken.</p>
    </Container>
  </Layout>
);

export default NotFound;
