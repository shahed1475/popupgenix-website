import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { Brain, Users, TrendingUp, Sparkles, ArrowRight, CheckCircle2 } from "lucide-react";

const AIAndML = () => {
  const features = [
    "Natural Language Processing (NLP)",
    "Computer Vision & Image Recognition",
    "Predictive Analytics & Forecasting",
    "AI Security & Threat Detection",
    "Machine Learning Model Development",
    "Deep Learning Solutions",
    "Automated Decision Making",
    "AI-Powered Chatbots"
  ];

  const benefits = [
    { icon: Users, title: "Who Needs It?", description: "Businesses that rely on large volumes of data, customer interactions, or automation — such as finance, healthcare, retail, and e-commerce." },
    { icon: TrendingUp, title: "Why They Need It?", description: "Traditional methods of analyzing and processing data are slow and limited. AI allows companies to uncover hidden insights, detect trends, and act in real time." },
    { icon: CheckCircle2, title: "How It Helps?", description: "AI improves efficiency through automation, enhances customer experiences with personalization, and provides predictive models for smarter decisions. From chatbots to fraud detection, it creates measurable growth and competitive advantage." }
  ];

  return (
    <div className="min-h-screen bg-background">
      <Header />
      
      {/* Hero Section */}
      <section className="pt-32 pb-20 relative overflow-hidden">
        {/* Animated Background */}
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

        {/* Glowing Orbs */}
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-20 right-20 w-96 h-96 bg-primary/20 rounded-full blur-[100px] animate-pulse" style={{ animationDuration: '4s' }}></div>
          <div className="absolute bottom-20 left-20 w-80 h-80 bg-accent/10 rounded-full blur-[100px] animate-pulse" style={{ animationDuration: '6s', animationDelay: '1s' }}></div>
        </div>

        <div className="container mx-auto px-6 relative z-10">
          <div className="max-w-4xl mx-auto text-center">
            <div className="inline-flex items-center space-x-2 backdrop-blur-md rounded-full px-6 py-3 mb-8 border animate-fade-in"
                 style={{ 
                   background: 'rgba(255, 255, 255, 0.05)',
                   borderColor: 'rgba(138, 43, 226, 0.4)',
                   boxShadow: '0 8px 32px rgba(0, 0, 0, 0.3)'
                 }}>
              <Brain className="w-5 h-5 text-primary" />
              <span className="text-sm font-medium">AI & Machine Learning</span>
            </div>

            <h1 className="text-5xl md:text-7xl font-bold mb-6 bg-gradient-primary bg-clip-text text-transparent">
              Transform Your Business with AI
            </h1>

            <p className="text-xl text-muted-foreground mb-8 leading-relaxed">
              Harness the power of Artificial Intelligence and Machine Learning to automate processes, 
              uncover insights, and drive innovation across your organization.
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

      {/* Who, Why, How Section */}
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
                    borderColor: 'rgba(138, 43, 226, 0.3)',
                    boxShadow: '0 8px 32px rgba(0, 0, 0, 0.3)',
                    animationDelay: `${index * 0.2}s`
                  }}
                >
                  <div className="inline-flex p-4 rounded-2xl backdrop-blur-sm border mb-6"
                       style={{
                         background: 'rgba(138, 43, 226, 0.1)',
                         borderColor: 'rgba(138, 43, 226, 0.3)'
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

      {/* Features Section */}
      <section className="py-20 relative">
        <div className="container mx-auto px-6 relative z-10">
          <div className="max-w-4xl mx-auto">
            <div className="text-center mb-16">
              <h2 className="text-4xl md:text-5xl font-bold mb-6 bg-gradient-primary bg-clip-text text-transparent">
                Our AI Capabilities
              </h2>
              <p className="text-xl text-muted-foreground">
                Comprehensive AI solutions tailored to your business needs
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {features.map((feature, index) => (
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

      {/* CTA Section */}
      <section className="py-20 relative">
        <div className="container mx-auto px-6 relative z-10">
          <div
            className="backdrop-blur-xl p-12 rounded-3xl border max-w-4xl mx-auto text-center transition-all duration-500 hover:scale-[1.02]"
            style={{
              background: 'rgba(255, 255, 255, 0.05)',
              borderColor: 'rgba(138, 43, 226, 0.4)',
              boxShadow: '0 8px 32px rgba(0, 0, 0, 0.3), 0 0 40px rgba(138, 43, 226, 0.2)'
            }}
          >
            <Sparkles className="w-12 h-12 text-primary mx-auto mb-6" />
            <h2 className="text-3xl font-bold mb-4 text-foreground">
              Ready to Transform with AI?
            </h2>
            <p className="text-muted-foreground mb-8 max-w-2xl mx-auto">
              Let's discuss how AI and Machine Learning can revolutionize your business operations 
              and drive unprecedented growth.
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

export default AIAndML;
