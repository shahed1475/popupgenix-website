import Footer from "@/components/Footer";
import { Card } from "@/components/ui/card";

const TermsAndConditions = () => {
  return (
    <div className="min-h-screen bg-background">
      <main id="main-content">
      
      <section className="relative py-20">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-background to-secondary/5" />
        <div className="container mx-auto px-4 relative z-10 max-w-4xl">
          <h1 className="text-4xl md:text-5xl font-bold text-center mb-6 bg-gradient-to-r from-primary via-primary-glow to-secondary bg-clip-text text-transparent">
            Terms and Conditions
          </h1>
          <p className="text-center text-muted-foreground mb-12">
            Last Updated: 9/30/2025
          </p>

          <div className="space-y-8">
            <Card className="p-8 border-border bg-card/50 backdrop-blur">
              <h2 className="text-2xl font-bold mb-4 text-foreground">1. Acceptance of Terms</h2>
              <p className="text-muted-foreground leading-relaxed">
                By using PopupGenix services, you confirm that you accept these Terms and agree to comply with them. If you do not agree, please discontinue use immediately.
              </p>
            </Card>

            <Card className="p-8 border-border bg-card/50 backdrop-blur">
              <h2 className="text-2xl font-bold mb-4 text-foreground">2. User Accounts & Responsibilities</h2>
              <p className="text-muted-foreground leading-relaxed mb-4">
                To access certain services, you may need to create an account and provide accurate, complete, and up-to-date information.
              </p>
              <p className="text-muted-foreground leading-relaxed mb-4">
                You are responsible for safeguarding your login credentials and any activities that occur under your account.
              </p>
              <p className="text-muted-foreground leading-relaxed">
                You must notify us immediately if you suspect unauthorized access or security breaches.
              </p>
            </Card>

            <Card className="p-8 border-border bg-card/50 backdrop-blur">
              <h2 className="text-2xl font-bold mb-4 text-foreground">3. Payments & Subscriptions</h2>
              <p className="text-muted-foreground leading-relaxed mb-4">
                Subscription fees are billed in advance on a monthly or annual basis and are non-refundable except as outlined in our Refund Policy.
              </p>
              <p className="text-muted-foreground leading-relaxed mb-4">
                Unless canceled before the renewal date, subscriptions will automatically renew at the end of each billing cycle.
              </p>
              <p className="text-muted-foreground leading-relaxed">
                We reserve the right to update our pricing with 30 days' notice. Continued use after pricing changes constitutes acceptance of the new terms.
              </p>
            </Card>

            <Card className="p-8 border-border bg-card/50 backdrop-blur">
              <h2 className="text-2xl font-bold mb-4 text-foreground">4. Use of Services</h2>
              <p className="text-muted-foreground leading-relaxed mb-4">
                PopupGenix provides custom software, SaaS platforms, ERP/CRM systems, web/mobile apps, and AI/ML integration services. You agree to use these services only for lawful purposes. Prohibited uses include but are not limited to:
              </p>
              <ul className="list-disc list-inside text-muted-foreground space-y-2 ml-4">
                <li>Violating any applicable laws or regulations.</li>
                <li>Attempting unauthorized access to our systems.</li>
                <li>Disrupting or interfering with service performance.</li>
                <li>Using our AI solutions to generate harmful, illegal, or misleading content.</li>
                <li>Reselling or redistributing our services without prior written consent.</li>
              </ul>
            </Card>

            <Card className="p-8 border-border bg-card/50 backdrop-blur">
              <h2 className="text-2xl font-bold mb-4 text-foreground">5. Intellectual Property</h2>
              <p className="text-muted-foreground leading-relaxed mb-4">
                All software, features, content, and technology provided by PopupGenix are the intellectual property of PopupGenix and its licensors.
              </p>
              <p className="text-muted-foreground leading-relaxed mb-4">
                Our trademarks, brand assets, and designs may not be used without written consent.
              </p>
              <p className="text-muted-foreground leading-relaxed">
                You retain ownership of any content you submit but grant PopupGenix a non-exclusive, royalty-free license to use it as necessary to deliver services.
              </p>
            </Card>

            <Card className="p-8 border-border bg-card/50 backdrop-blur">
              <h2 className="text-2xl font-bold mb-4 text-foreground">6. Termination of Services</h2>
              <p className="text-muted-foreground leading-relaxed mb-4">
                PopupGenix may suspend or terminate your account immediately if you violate these Terms.
              </p>
              <p className="text-muted-foreground leading-relaxed mb-4">
                Upon termination, your right to use the services will end immediately.
              </p>
              <p className="text-muted-foreground leading-relaxed">
                You may terminate your account anytime by discontinuing use and canceling subscriptions.
              </p>
            </Card>

            <Card className="p-8 border-border bg-card/50 backdrop-blur">
              <h2 className="text-2xl font-bold mb-4 text-foreground">7. Limitation of Liability</h2>
              <p className="text-muted-foreground leading-relaxed mb-4">
                PopupGenix, its employees, partners, and affiliates shall not be liable for indirect, incidental, or consequential damages, including loss of profits, data, or goodwill.
              </p>
              <p className="text-muted-foreground leading-relaxed">
                Our total liability for all claims shall not exceed the total amount paid by you to PopupGenix in the 12 months prior to the claim.
              </p>
            </Card>

            <Card className="p-8 border-border bg-card/50 backdrop-blur">
              <h2 className="text-2xl font-bold mb-4 text-foreground">8. Governing Law</h2>
              <p className="text-muted-foreground leading-relaxed">
                These Terms are governed by the laws of the jurisdiction in which PopupGenix operates. Any disputes shall be resolved through binding arbitration, unless otherwise required by law.
              </p>
            </Card>

            <Card className="p-8 border-border bg-card/50 backdrop-blur">
              <h2 className="text-2xl font-bold mb-4 text-foreground">9. Changes to Terms</h2>
              <p className="text-muted-foreground leading-relaxed mb-4">
                We may revise these Terms from time to time. Any updates will be posted on this page with a revised "Last Updated" date.
              </p>
              <p className="text-muted-foreground leading-relaxed">
                Your continued use of our services indicates acceptance of these changes.
              </p>
            </Card>

            <Card className="p-8 border-border bg-card/50 backdrop-blur bg-primary/5">
              <h2 className="text-2xl font-bold mb-4 text-foreground">10. Contact Us</h2>
              <p className="text-muted-foreground leading-relaxed mb-4">
                If you have any questions regarding these Terms & Conditions, you may contact us:
              </p>
              <p className="text-foreground mb-2">
                📧 Email: <a href="mailto:support@popupgenix.com" className="text-primary hover:underline font-semibold">support@popupgenix.com</a>
              </p>
              <p className="text-foreground">
                🏢 Company: PopupGenix
              </p>
            </Card>
          </div>
        </div>
      </section>

      </main>
      <Footer />
    </div>
  );
};

export default TermsAndConditions;
