import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { Users, TrendingUp, Sparkles, ArrowRight, CheckCircle2, Target } from "lucide-react";

const CRMAndSaaS = () => {
  const features = [
    "Sales Automation",
    "AI-Powered Dashboards",
    "Customer Analytics",
    "Lead Management",
    "Multi-tenant SaaS Architecture",
    "Subscription Management",
    "Real-time Reporting",
    "Integration APIs"
  ];

  const benefits = [
    { icon: Target, title: "Who Needs It?", description: "Businesses that manage customer relationships, sales pipelines, or SaaS startups delivering software to clients." },
    { icon: TrendingUp, title: "Why They Need It?", description: "Customer data scattered across spreadsheets or outdated systems slows growth. A modern CRM or SaaS tool centralizes everything." },
    { icon: CheckCircle2, title: "How It Helps?", description: "It streamlines workflows, improves customer experiences, and enables automation. SaaS platforms provide scalability, while CRMs strengthen sales and service — helping businesses increase efficiency and maximize revenue." }
  ];

  return (
    <div className="min-h-screen bg-background">
      <Header />
      
      <section className="pt-32 pb-20 relative overflow-hidden">
        <div className="absolute inset-0 opacity-20">
          {[...Array(3)].map((_, i) => (
            <div
              key={i}
              className="absolute w-full h-1"
              style={{
                top: `${20 + i * 30}%`,
                background: 'linear-gradient(90deg, transparent, rgba(138, 43, 226, 0.4), rgba(33, 150, 243, 0.4), transparent)',
                animation: `wave-horizontal ${5 + i * 2}s ease-in-out infinite`,
                animationDelay: `${i * 0.8}s`
              }}
            />
          ))}
        </div>

        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-20 left-20 w-96 h-96 bg-primary/20 rounded-full blur-[100px] animate-pulse" style={{ animationDuration: '6s' }}></div>
          <div className="absolute bottom-20 right-20 w-80 h-80 bg-accent/10 rounded-full blur-[100px] animate-pulse" style={{ animationDuration: '8s', animationDelay: '2s' }}></div>
        </div>

        <div className="container mx-auto px-6 relative z-10">
          <div className="max-w-4xl mx-auto text-center">
            <div className="inline-flex items-center space-x-2 backdrop-blur-md rounded-full px-6 py-3 mb-8 border animate-fade-in"
                 style={{ 
                   background: 'rgba(255, 255, 255, 0.05)',
                   borderColor: 'rgba(33, 150, 243, 0.4)',
                   boxShadow: '0 8px 32px rgba(0, 0, 0, 0.3)'
                 }}>
              <Users className="w-5 h-5 text-primary" />
              <span className="text-sm font-medium">CRM & SaaS Solutions</span>
            </div>

            <h1 className="text-5xl md:text-7xl font-bold mb-6 bg-gradient-primary bg-clip-text text-transparent">
              Intelligent CRM & SaaS Platforms
            </h1>

            <p className="text-xl text-muted-foreground mb-8 leading-relaxed">
              Build powerful customer relationship management systems and scalable SaaS platforms 
              with AI-powered insights and automation.
            </p>

            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <Link to="/contact">
                <Button variant="hero" size="lg" className="hover:scale-110 transition-transform duration-300">
                  Get Started
                  <ArrowRight className="w-5 h-5" />
                </Button>
              </Link>
              <Link to="/contact">
                <Button variant="outline" size="lg" className="hover:scale-110 transition-transform duration-300">
                  Talk to Expert
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </section>

      <section className="py-20 relative">
        <div className="container mx-auto px-6 relative z-10">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-20">
            {benefits.map((benefit, index) => {
              const IconComponent = benefit.icon;
              return (
                <div
                  key={benefit.title}
                  className="backdrop-blur-xl rounded-3xl p-8 border transition-all duration-700 hover:scale-105"
                  style={{
                    background: 'rgba(255, 255, 255, 0.03)',
                    borderColor: 'rgba(33, 150, 243, 0.3)',
                    boxShadow: '0 8px 32px rgba(0, 0, 0, 0.3)'
                  }}
                >
                  <div className="inline-flex p-4 rounded-2xl backdrop-blur-sm border mb-6"
                       style={{
                         background: 'rgba(33, 150, 243, 0.1)',
                         borderColor: 'rgba(33, 150, 243, 0.3)'
                       }}>
                    <IconComponent className="w-8 h-8 text-primary" />
                  </div>
                  <h3 className="text-2xl font-bold mb-4 text-foreground">{benefit.title}</h3>
                  <p className="text-muted-foreground leading-relaxed">{benefit.description}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <section className="py-20 relative">
        <div className="container mx-auto px-6 relative z-10">
          <div className="max-w-4xl mx-auto">
            <div className="text-center mb-16">
              <h2 className="text-4xl md:text-5xl font-bold mb-6 bg-gradient-primary bg-clip-text text-transparent">
                CRM & SaaS Features
              </h2>
              <p className="text-xl text-muted-foreground">
                Comprehensive tools to manage customers and scale your business
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {features.map((feature) => (
                <div
                  key={feature}
                  className="backdrop-blur-xl rounded-2xl p-6 border transition-all duration-500 hover:scale-105 flex items-center group"
                  style={{
                    background: 'rgba(255, 255, 255, 0.03)',
                    borderColor: 'rgba(33, 150, 243, 0.2)',
                    boxShadow: '0 8px 32px rgba(0, 0, 0, 0.3)'
                  }}
                >
                  <div className="w-2 h-2 rounded-full bg-accent mr-4 group-hover:scale-150 transition-transform"
                       style={{ boxShadow: '0 0 10px rgba(16, 185, 129, 0.8)' }}></div>
                  <span className="text-foreground group-hover:text-accent transition-colors">{feature}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="py-20 relative">
        <div className="container mx-auto px-6 relative z-10">
          <div
            className="backdrop-blur-xl p-12 rounded-3xl border max-w-4xl mx-auto text-center transition-all duration-500 hover:scale-[1.02]"
            style={{
              background: 'rgba(255, 255, 255, 0.05)',
              borderColor: 'rgba(33, 150, 243, 0.4)',
              boxShadow: '0 8px 32px rgba(0, 0, 0, 0.3), 0 0 40px rgba(33, 150, 243, 0.2)'
            }}
          >
            <Sparkles className="w-12 h-12 text-primary mx-auto mb-6" />
            <h2 className="text-3xl font-bold mb-4 text-foreground">
              Ready to Optimize Customer Management?
            </h2>
            <p className="text-muted-foreground mb-8 max-w-2xl mx-auto">
              Let's build an intelligent CRM or SaaS platform that centralizes data, automates workflows, 
              and scales with your business.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <Link to="/contact">
                <Button variant="hero" size="lg">
                  Request a Quote
                  <ArrowRight className="w-5 h-5" />
                </Button>
              </Link>
              <Link to="/#services">
                <Button variant="outline" size="lg">
                  View All Services
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
};

export default CRMAndSaaS;
