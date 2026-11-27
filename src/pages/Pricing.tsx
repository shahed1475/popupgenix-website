import { Check } from "lucide-react";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useNavigate, Link } from "react-router-dom";

const Pricing = () => {
  const navigate = useNavigate();

  const plans = [
    {
      name: "Starter",
      price: "$500",
      period: "/month",
      description: "Perfect for growing businesses looking to leverage AI and SaaS solutions",
      features: [
        "Core SaaS integrations (basic API access)",
        "Standard email support",
        "Access to documentation & knowledge base",
        "Basic AI-powered automation tools",
        "Monthly usage reports",
        "Community forum access"
      ],
      cta: "Get Started",
      ctaAction: () => navigate("/contact"),
      highlighted: true
    },
    {
      name: "Enterprise",
      price: "Custom",
      period: "Pricing",
      description: "Tailored solutions for organizations requiring advanced AI and full-scale SaaS products",
      features: [
        "Unlimited usage",
        "Full AI integration (custom workflows, agentic AI support)",
        "Dedicated account manager",
        "Tailored SaaS product solutions",
        "SLA, compliance, and premium onboarding",
        "Priority 24/7 support",
        "Custom integrations & API access",
        "Advanced analytics & reporting"
      ],
      cta: "Contact Sales",
      ctaAction: () => navigate("/contact"),
      highlighted: false
    }
  ];

  return (
    <div className="min-h-screen bg-background">
      <Header />
      
      {/* Hero Section */}
      <section className="relative py-20 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-background to-secondary/5" />
        <div className="container mx-auto px-4 relative z-10">
          <div className="text-center max-w-3xl mx-auto mb-16">
            <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold mb-6 bg-gradient-to-r from-primary via-primary-glow to-secondary bg-clip-text text-transparent">
              Simple, Transparent Pricing
            </h1>
            <p className="text-lg md:text-xl text-muted-foreground">
              Choose the plan that fits your business needs. Scale as you grow with our flexible pricing options.
            </p>
          </div>

          {/* Pricing Cards */}
          <div className="grid md:grid-cols-2 gap-8 max-w-5xl mx-auto">
            {plans.map((plan) => (
              <Card
                key={plan.name}
                className={`p-8 transition-all duration-300 hover:shadow-elegant ${
                  plan.highlighted
                    ? "border-primary shadow-glow bg-gradient-to-br from-background to-primary/5"
                    : "border-border"
                }`}
              >
                {plan.highlighted && (
                  <div className="inline-block px-3 py-1 mb-4 text-xs font-semibold text-primary-foreground bg-primary rounded-full">
                    Most Popular
                  </div>
                )}
                
                <h3 className="text-2xl font-bold mb-2">{plan.name}</h3>
                <div className="flex items-baseline mb-2">
                  <span className="text-4xl font-bold text-foreground">{plan.price}</span>
                  <span className="text-muted-foreground ml-2">{plan.period}</span>
                </div>
                <p className="text-muted-foreground mb-6">{plan.description}</p>

                <Button
                  onClick={plan.ctaAction}
                  className={`w-full mb-8 ${
                    plan.highlighted
                      ? "bg-primary hover:bg-primary/90"
                      : "bg-secondary hover:bg-secondary/90"
                  }`}
                  size="lg"
                >
                  {plan.cta}
                </Button>

                <div className="space-y-3">
                  {plan.features.map((feature, index) => (
                    <div key={index} className="flex items-start gap-3">
                      <Check className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
                      <span className="text-foreground">{feature}</span>
                    </div>
                  ))}
                </div>
              </Card>
            ))}
          </div>

          {/* FAQ Section */}
          <div className="max-w-3xl mx-auto mt-20">
            <h2 className="text-3xl font-bold text-center mb-10">Frequently Asked Questions</h2>
            <div className="space-y-6">
              <Card className="p-6">
                <h3 className="font-semibold text-lg mb-2">Can I switch plans later?</h3>
                <p className="text-muted-foreground">
                  Yes, you can upgrade or downgrade your plan at any time. Changes will be reflected in your next billing cycle.
                </p>
              </Card>
              <Card className="p-6">
                <h3 className="font-semibold text-lg mb-2">What payment methods do you accept?</h3>
                <p className="text-muted-foreground">
                  We accept all major credit cards, bank transfers, and digital payment methods through our secure payment processor Paddle.
                </p>
              </Card>
              <Card className="p-6">
                <h3 className="font-semibold text-lg mb-2">Is there a refund policy?</h3>
                <p className="text-muted-foreground">
                  Yes, we offer refunds within 14 days of purchase. Please see our{" "}
                  <Link to="/refund-policy" className="text-primary hover:underline">
                    Refund Policy
                  </Link>{" "}
                  for more details.
                </p>
              </Card>
              <Card className="p-6">
                <h3 className="font-semibold text-lg mb-2">How does Enterprise pricing work?</h3>
                <p className="text-muted-foreground">
                  Enterprise pricing is customized based on your specific needs, usage requirements, and integration complexity. Contact our sales team for a personalized quote.
                </p>
              </Card>
            </div>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
};

export default Pricing;
