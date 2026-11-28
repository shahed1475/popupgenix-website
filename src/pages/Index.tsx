import Hero from "@/components/Hero";
import About from "@/components/About";
import Services from "@/components/Services";
import Portfolio from "@/components/Portfolio";
import Footer from "@/components/Footer";

const Index = () => {
  return (
    <div className="min-h-screen bg-background">
      <main id="main-content">
        <Hero />
        <About />
        <Services />
        <Portfolio />
      </main>
      <Footer />
    </div>
  );
};

export default Index;
