import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { Shield, AlertTriangle, Mail, Phone, MapPin } from "lucide-react";

const PrivacyPolicy = () => {
  const [contactForm, setContactForm] = useState({
    name: "",
    email: "",
    subject: "",
    message: ""
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { toast } = useToast();

  const handleContactSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      const { error } = await supabase
        .from('contact_submissions')
        .insert({
          name: contactForm.name,
          email: contactForm.email,
          subject: contactForm.subject || "Privacy Policy Inquiry",
          message: contactForm.message
        });

      if (error) throw error;

      toast({
        title: "Message sent successfully!",
        description: "We'll get back to you within 24 hours.",
      });

      setContactForm({ name: "", email: "", subject: "", message: "" });
    } catch (error) {
      toast({
        title: "Error sending message",
        description: "Please try again later.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <Header />
      
      {/* Hero Section */}
      <section className="pt-20 pb-16 px-4 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/20 via-background to-accent/20"></div>
        <div className="container mx-auto text-center relative z-10">
          <div className="flex justify-center mb-6">
            <div className="p-4 rounded-full bg-primary/10 border border-primary/20">
              <Shield className="w-12 h-12 text-primary" />
            </div>
          </div>
          <h1 className="text-4xl md:text-6xl font-bold mb-6 bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
            Privacy Policy
          </h1>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
            PopupGenix.com – Secure. Reliable. Trusted.
          </p>
        </div>
      </section>

      <div className="container mx-auto px-4 py-16 max-w-4xl">
        {/* Privacy Policy Section */}
        <Card className="mb-12 bg-card/50 backdrop-blur-sm border border-border/50">
          <CardHeader>
            <div className="flex items-center gap-3 mb-4">
              <Shield className="w-8 h-8 text-primary" />
              <CardTitle className="text-3xl">🔒 Privacy Policy</CardTitle>
            </div>
            <CardDescription className="text-base">
              Last Updated: {new Date().toLocaleDateString()}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-8">
            <div>
              <h3 className="text-xl font-semibold mb-4 text-primary">1. Information We Collect</h3>
              <p className="text-muted-foreground leading-relaxed mb-3">
                PopupGenix collects the following types of information:
              </p>
              <ul className="list-disc list-inside space-y-2 text-muted-foreground ml-4">
                <li><strong>Personal Information:</strong> Name, email address, phone number, company name</li>
                <li><strong>Account Information:</strong> Username, password, billing details</li>
                <li><strong>Payment Information:</strong> Credit card details, billing address (processed securely through Paddle)</li>
                <li><strong>Technical Data:</strong> IP address, browser type, device information, operating system</li>
                <li><strong>Usage Data:</strong> Pages visited, features used, time spent on site, interaction data</li>
                <li><strong>Cookies:</strong> Session cookies, preference cookies, analytics cookies</li>
                <li><strong>Project Data:</strong> Files, documents, and content you upload or create using our services</li>
              </ul>
            </div>

            <div>
              <h3 className="text-xl font-semibold mb-4 text-primary">2. How We Use Your Information</h3>
              <p className="text-muted-foreground mb-3">We use the information we collect for the following purposes:</p>
              <ul className="list-disc list-inside space-y-2 text-muted-foreground ml-4">
                <li><strong>Service Delivery:</strong> To provide, maintain, and improve our SaaS products and AI-powered services</li>
                <li><strong>Billing & Payments:</strong> To process transactions, manage subscriptions, and send invoices</li>
                <li><strong>AI Processing:</strong> To power AI-driven features such as automation, content generation, and analytics</li>
                <li><strong>Communication:</strong> To send service updates, newsletters, marketing materials, and respond to inquiries</li>
                <li><strong>Analytics:</strong> To analyze usage patterns and improve our services</li>
                <li><strong>Security:</strong> To detect and prevent fraud, abuse, and security incidents</li>
                <li><strong>Legal Compliance:</strong> To comply with applicable laws, regulations, and legal processes</li>
              </ul>
            </div>

            <div>
              <h3 className="text-xl font-semibold mb-4 text-primary">3. Third-Party Sharing</h3>
              <p className="text-muted-foreground leading-relaxed mb-3">
                We may share your information with trusted third-party service providers who assist us in operating our business:
              </p>
              <ul className="list-disc list-inside space-y-2 text-muted-foreground ml-4">
                <li><strong>Payment Processors:</strong> Paddle (for secure payment processing and billing)</li>
                <li><strong>Hosting Providers:</strong> Cloud infrastructure providers for data storage and application hosting</li>
                <li><strong>Analytics Tools:</strong> Google Analytics and similar services for usage tracking and insights</li>
                <li><strong>AI APIs:</strong> Third-party AI service providers (OpenAI, Google, etc.) for AI-powered features</li>
                <li><strong>Email Services:</strong> Email delivery platforms for transactional and marketing emails</li>
                <li><strong>Customer Support:</strong> Help desk and support ticket management systems</li>
              </ul>
              <p className="text-muted-foreground leading-relaxed mt-3">
                We do not sell, rent, or trade your personal information to third parties for marketing purposes. All third-party providers are contractually obligated to protect your data.
              </p>
            </div>

            <div>
              <h3 className="text-xl font-semibold mb-4 text-primary">4. Data Security & Protection</h3>
              <p className="text-muted-foreground leading-relaxed mb-3">
                We implement industry-standard security measures to protect your information, including:
              </p>
              <ul className="list-disc list-inside space-y-2 text-muted-foreground ml-4">
                <li>SSL/TLS encryption for data transmission</li>
                <li>Encrypted data storage</li>
                <li>Regular security audits and vulnerability assessments</li>
                <li>Access controls and authentication mechanisms</li>
                <li>Employee training on data protection best practices</li>
              </ul>
              <p className="text-muted-foreground leading-relaxed mt-3">
                However, no method of transmission over the Internet or electronic storage is 100% secure. While we strive to protect your personal information, we cannot guarantee absolute security.
              </p>
            </div>

            <div>
              <h3 className="text-xl font-semibold mb-4 text-primary">5. Data Retention</h3>
              <p className="text-muted-foreground leading-relaxed mb-3">
                We retain your personal information for as long as necessary to fulfill the purposes outlined in this Privacy Policy, unless a longer retention period is required or permitted by law. When your data is no longer needed, we securely delete or anonymize it.
              </p>
              <ul className="list-disc list-inside space-y-2 text-muted-foreground ml-4">
                <li><strong>Account Data:</strong> Retained while your account is active</li>
                <li><strong>Transaction Records:</strong> Retained for 7 years for accounting and tax purposes</li>
                <li><strong>Marketing Data:</strong> Retained until you opt out or request deletion</li>
              </ul>
            </div>

            <div>
              <h3 className="text-xl font-semibold mb-4 text-primary">6. Your Rights</h3>
              <p className="text-muted-foreground leading-relaxed mb-3">
                You have the following rights regarding your personal information:
              </p>
              <ul className="list-disc list-inside space-y-2 text-muted-foreground ml-4">
                <li><strong>Access:</strong> Request a copy of the personal information we hold about you</li>
                <li><strong>Correction:</strong> Request correction of inaccurate or incomplete information</li>
                <li><strong>Deletion:</strong> Request deletion of your personal information (subject to legal requirements)</li>
                <li><strong>Opt-Out:</strong> Unsubscribe from marketing communications at any time</li>
                <li><strong>Data Portability:</strong> Request a copy of your data in a machine-readable format</li>
                <li><strong>Object:</strong> Object to processing of your personal information for certain purposes</li>
              </ul>
              <p className="text-muted-foreground leading-relaxed mt-3">
                To exercise any of these rights, please contact us at{" "}
                <a href="mailto:support@popupgenix.com" className="text-primary hover:underline font-semibold">
                  support@popupgenix.com
                </a>
              </p>
            </div>

            <div>
              <h3 className="text-xl font-semibold mb-4 text-primary">7. Cookies & Tracking Technologies</h3>
              <p className="text-muted-foreground leading-relaxed mb-3">
                We use cookies and similar tracking technologies to enhance your experience:
              </p>
              <ul className="list-disc list-inside space-y-2 text-muted-foreground ml-4">
                <li><strong>Essential Cookies:</strong> Required for basic site functionality</li>
                <li><strong>Performance Cookies:</strong> Help us understand how visitors interact with our site</li>
                <li><strong>Functional Cookies:</strong> Remember your preferences and settings</li>
                <li><strong>Marketing Cookies:</strong> Track your visits across websites for targeted advertising</li>
              </ul>
              <p className="text-muted-foreground leading-relaxed mt-3">
                You can control cookie preferences through your browser settings. However, disabling cookies may limit your ability to use certain features of our services.
              </p>
            </div>

            <div>
              <h3 className="text-xl font-semibold mb-4 text-primary">8. Updates to Privacy Policy</h3>
              <p className="text-muted-foreground leading-relaxed">
                PopupGenix may update this policy at any time. We will notify you of any material changes by posting the new Privacy Policy on this page and updating the "Last Updated" date. Your continued use of our services after any changes constitutes acceptance of the updated Privacy Policy.
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Contact Section */}
        <Card className="mb-12 bg-card/50 backdrop-blur-sm border border-border/50">
          <CardHeader>
            <div className="flex items-center gap-3 mb-4">
              <Mail className="w-8 h-8 text-accent" />
              <CardTitle className="text-3xl">Contact Us</CardTitle>
            </div>
            <CardDescription>
              Have questions about our privacy policy or terms? Get in touch with us.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid md:grid-cols-2 gap-8">
              <div>
                <form onSubmit={handleContactSubmit} className="space-y-4">
                  <Input
                    placeholder="Your Name"
                    value={contactForm.name}
                    onChange={(e) => setContactForm(prev => ({ ...prev, name: e.target.value }))}
                    required
                  />
                  <Input
                    type="email"
                    placeholder="Your Email"
                    value={contactForm.email}
                    onChange={(e) => setContactForm(prev => ({ ...prev, email: e.target.value }))}
                    required
                  />
                  <Input
                    placeholder="Subject (Optional)"
                    value={contactForm.subject}
                    onChange={(e) => setContactForm(prev => ({ ...prev, subject: e.target.value }))}
                  />
                  <Textarea
                    placeholder="Your Message"
                    value={contactForm.message}
                    onChange={(e) => setContactForm(prev => ({ ...prev, message: e.target.value }))}
                    rows={4}
                    required
                  />
                  <Button type="submit" disabled={isSubmitting} className="w-full">
                    {isSubmitting ? "Sending..." : "Send Message"}
                  </Button>
                </form>
              </div>
              
              <div className="space-y-6">
                <div className="flex items-start gap-3">
                  <Mail className="w-5 h-5 text-primary mt-1" />
                  <div>
                    <h4 className="font-semibold">Email Support</h4>
                    <p className="text-muted-foreground">hello@popupgenix.com</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <Phone className="w-5 h-5 text-accent mt-1" />
                  <div>
                    <h4 className="font-semibold">Phone Support</h4>
                    <p className="text-muted-foreground">+1 479 689 1012</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <MapPin className="w-5 h-5 text-primary mt-1" />
                  <div>
                    <h4 className="font-semibold">Address</h4>
                    <p className="text-muted-foreground">1209 MOUNTAIN ROAD PL NE, STE R, ALBUQUERQUE, NM 87110, USA</p>
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Footer Trust Message */}
        <div className="text-center bg-muted/20 rounded-lg p-8 border border-border/50">
          <AlertTriangle className="w-12 h-12 text-primary mx-auto mb-4" />
          <h3 className="text-xl font-semibold mb-4">Our Commitment</h3>
          <p className="text-muted-foreground max-w-2xl mx-auto leading-relaxed">
            PopupGenix is committed to secure, fair, and reliable services. By using our platform, you agree to our Privacy Policy.
          </p>
          <div className="mt-6 pt-6 border-t border-border/30">
            <p className="text-sm text-muted-foreground">
              © 2025 PopupGenix.com – All Rights Reserved
            </p>
          </div>
        </div>
      </div>

      <Footer />
    </div>
  );
};

export default PrivacyPolicy;