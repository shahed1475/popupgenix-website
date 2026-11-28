import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { Card } from "@/components/ui/card";

const RefundPolicy = () => {
  return (
    <div className="min-h-screen bg-background">
      <Header />
      
      <section className="relative py-20">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-background to-secondary/5" />
        <div className="container mx-auto px-4 relative z-10 max-w-4xl">
          <h1 className="text-4xl md:text-5xl font-bold text-center mb-6 bg-gradient-to-r from-primary via-primary-glow to-secondary bg-clip-text text-transparent">
            30-Day Refund Policy
          </h1>
          <p className="text-center text-muted-foreground mb-12">
            Last updated: 28 November 2026
          </p>

          <div className="space-y-8">
            <Card className="p-8 border-border bg-card/50 backdrop-blur">
              <h2 className="text-2xl font-bold mb-4 text-foreground">30-Day Money-Back Guarantee</h2>
              <p className="text-muted-foreground leading-relaxed mb-4">
                We stand behind the quality of our services. If you're not completely satisfied with your purchase, we offer refunds within <strong className="text-foreground">30 days of purchase</strong> for subscription payments, unless otherwise stated.
              </p>
              <p className="text-muted-foreground leading-relaxed">
                To request a refund, please contact us at{" "}
                <a href="mailto:support@popupgenix.com" className="text-primary hover:underline font-semibold">
                  support@popupgenix.com
                </a>{" "}
                with your account details and reason for the refund request.
              </p>
            </Card>

            <Card className="p-8 border-border bg-card/50 backdrop-blur">
              <h2 className="text-2xl font-bold mb-4 text-foreground">After 30 Days</h2>
              <p className="text-muted-foreground leading-relaxed">
                After 30 days from the date of purchase, all payments are <strong className="text-foreground">non-refundable</strong>. We encourage you to carefully review our services and pricing before making a purchase decision.
              </p>
            </Card>

            <Card className="p-8 border-border bg-card/50 backdrop-blur">
              <h2 className="text-2xl font-bold mb-4 text-foreground">Enterprise Plans</h2>
              <p className="text-muted-foreground leading-relaxed mb-4">
                Enterprise plan refunds are handled on a <strong className="text-foreground">case-by-case basis</strong>. Due to the customized nature of Enterprise services, each refund request will be evaluated individually based on:
              </p>
              <ul className="list-disc list-inside text-muted-foreground space-y-2 ml-4">
                <li>Services already provided</li>
                <li>Resources allocated to your project</li>
                <li>Custom development work completed</li>
                <li>Time elapsed since service initiation</li>
              </ul>
              <p className="text-muted-foreground leading-relaxed mt-4">
                Please contact our sales team at{" "}
                <a href="mailto:support@popupgenix.com" className="text-primary hover:underline font-semibold">
                  support@popupgenix.com
                </a>{" "}
                to discuss Enterprise refund requests.
              </p>
            </Card>

            <Card className="p-8 border-border bg-card/50 backdrop-blur">
              <h2 className="text-2xl font-bold mb-4 text-foreground">Subscription Cancellations</h2>
              <p className="text-muted-foreground leading-relaxed mb-4">
                You may cancel your subscription at any time. Upon cancellation:
              </p>
              <ul className="list-disc list-inside text-muted-foreground space-y-2 ml-4">
                <li>You will retain access to your subscription until the end of your current billing period</li>
                <li>No refunds will be issued for partial months or unused time in your current billing cycle</li>
                <li>Your subscription will not renew for the next billing period</li>
              </ul>
              <p className="text-muted-foreground leading-relaxed mt-4">
                To cancel your subscription, please log in to your account and manage your billing settings, or contact support.
              </p>
            </Card>

            <Card className="p-8 border-border bg-card/50 backdrop-blur">
              <h2 className="text-2xl font-bold mb-4 text-foreground">Refund Processing Time</h2>
              <p className="text-muted-foreground leading-relaxed mb-4">
                Once a refund request is approved:
              </p>
              <ul className="list-disc list-inside text-muted-foreground space-y-2 ml-4">
                <li>Refunds are processed within 5-10 business days</li>
                <li>The refund will be issued to the original payment method</li>
                <li>You will receive a confirmation email once the refund has been processed</li>
                <li>Depending on your payment provider, it may take additional time for the refund to appear in your account</li>
              </ul>
            </Card>

            <Card className="p-8 border-border bg-card/50 backdrop-blur">
              <h2 className="text-2xl font-bold mb-4 text-foreground">Non-Refundable Items</h2>
              <p className="text-muted-foreground leading-relaxed mb-4">
                The following are not eligible for refunds:
              </p>
              <ul className="list-disc list-inside text-muted-foreground space-y-2 ml-4">
                <li>One-time setup fees</li>
                <li>Custom development work that has been completed and delivered</li>
                <li>Third-party service costs (API usage, hosting, etc.)</li>
                <li>Domain registration or transfer fees</li>
              </ul>
            </Card>

            <Card className="p-8 border-border bg-card/50 backdrop-blur">
              <h2 className="text-2xl font-bold mb-4 text-foreground">Refund Disputes</h2>
              <p className="text-muted-foreground leading-relaxed">
                If you have initiated a chargeback or payment dispute with your bank or payment provider, please contact us immediately. We are committed to resolving any issues directly and fairly. Chargebacks may result in immediate suspension of services and termination of your account.
              </p>
            </Card>

            <Card className="p-8 border-border bg-card/50 backdrop-blur bg-primary/5">
              <h2 className="text-2xl font-bold mb-4 text-foreground">Contact Us</h2>
              <p className="text-muted-foreground leading-relaxed mb-4">
                If you have any questions about our Refund Policy or need assistance with a refund request, please don't hesitate to contact us:
              </p>
              <p className="text-foreground font-semibold mb-2">
                Email: <a href="mailto:support@popupgenix.com" className="text-primary hover:underline">support@popupgenix.com</a>
              </p>
              <p className="text-muted-foreground leading-relaxed">
                Our support team is available Monday through Friday, 9 AM to 6 PM EST, and will respond to your inquiry within 24-48 hours.
              </p>
            </Card>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
};

export default RefundPolicy;
