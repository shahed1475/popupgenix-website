import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, Cookie, Shield, Settings, Info } from "lucide-react";
import { Link } from "react-router-dom";
import ContactSection from "@/components/ContactSection";

const CookiePolicy = () => {
  return (
    <div className="min-h-screen bg-background">
      {/* Hero Section */}
      <section className="relative py-24 bg-gradient-hero overflow-hidden">
        <div className="absolute inset-0">
          <div className="absolute top-0 left-0 w-96 h-96 bg-primary/10 rounded-full blur-3xl"></div>
          <div className="absolute bottom-0 right-0 w-72 h-72 bg-accent/10 rounded-full blur-3xl"></div>
        </div>
        
        <div className="container mx-auto px-6 relative z-10">
          <div className="text-center max-w-4xl mx-auto">
            <div className="flex items-center justify-center mb-6">
              <Cookie className="w-12 h-12 text-primary mr-4" />
              <h1 className="text-4xl md:text-6xl font-bold text-white">
                Cookie Policy
              </h1>
            </div>
            <p className="text-xl text-white/90 mb-8">
              Understanding How We Use Cookies – PopupGenix.com
            </p>
            <Link to="/">
              <Button variant="outline" size="lg" className="text-white border-white hover:bg-white hover:text-primary">
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back to Home
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* Cookie Policy Content */}
      <section className="py-16">
        <div className="container mx-auto px-6">
          <div className="max-w-4xl mx-auto space-y-8">
            
            {/* Consent Banner */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <Cookie className="w-5 h-5 mr-2 text-primary" />
                  Consent Banner
                </CardTitle>
              </CardHeader>
              <CardContent className="prose prose-lg max-w-none dark:prose-invert">
                <p>
                  When you first visit PopupGenix.com, you will be asked to accept or manage your cookie 
                  preferences through our consent banner. You can choose which cookies to allow and adjust 
                  your preferences at any time.
                </p>
              </CardContent>
            </Card>

            {/* What Are Cookies */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <Info className="w-5 h-5 mr-2 text-primary" />
                  What Are Cookies?
                </CardTitle>
              </CardHeader>
              <CardContent className="prose prose-lg max-w-none dark:prose-invert">
                <p>
                  Cookies are small text files that are placed on your device when you visit our website. 
                  They help us provide you with a better experience by remembering your preferences, 
                  analyzing site traffic, and personalizing content.
                </p>
              </CardContent>
            </Card>

            {/* Types of Cookies */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <Settings className="w-5 h-5 mr-2 text-primary" />
                  Types of Cookies We Use
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <div>
                  <h3 className="text-lg font-semibold mb-2">Essential Cookies</h3>
                  <p className="text-muted-foreground">
                    These cookies are necessary for the website to function properly. They enable core 
                    functionality such as security, network management, and accessibility.
                  </p>
                </div>
                
                <div>
                  <h3 className="text-lg font-semibold mb-2">Performance Cookies</h3>
                  <p className="text-muted-foreground">
                    These cookies collect information about how visitors use our website, such as which 
                    pages are visited most often. This data helps us improve our website performance.
                  </p>
                </div>
                
                <div>
                  <h3 className="text-lg font-semibold mb-2">Functional Cookies</h3>
                  <p className="text-muted-foreground">
                    These cookies allow the website to remember choices you make (such as your username, 
                    language, or region) and provide enhanced, more personal features.
                  </p>
                </div>
                
                <div>
                  <h3 className="text-lg font-semibold mb-2">Marketing Cookies</h3>
                  <p className="text-muted-foreground">
                    These cookies are used to deliver advertisements more relevant to you and your interests. 
                    They may also be used to limit the number of times you see an advertisement.
                  </p>
                </div>
              </CardContent>
            </Card>

            {/* Cookie Management */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <Shield className="w-5 h-5 mr-2 text-primary" />
                  Managing Your Cookie Preferences
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <h3 className="text-lg font-semibold mb-2">Browser Settings</h3>
                  <p className="text-muted-foreground mb-4">
                    You can control and/or delete cookies as you wish. You can delete all cookies that are 
                    already on your computer and you can set most browsers to prevent them from being placed.
                  </p>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="p-4 bg-muted/50 rounded-lg">
                      <h4 className="font-medium mb-2">Chrome</h4>
                      <p className="text-sm text-muted-foreground">
                        Settings → Privacy and Security → Cookies and other site data
                      </p>
                    </div>
                    <div className="p-4 bg-muted/50 rounded-lg">
                      <h4 className="font-medium mb-2">Firefox</h4>
                      <p className="text-sm text-muted-foreground">
                        Options → Privacy & Security → Cookies and Site Data
                      </p>
                    </div>
                    <div className="p-4 bg-muted/50 rounded-lg">
                      <h4 className="font-medium mb-2">Safari</h4>
                      <p className="text-sm text-muted-foreground">
                        Preferences → Privacy → Manage Website Data
                      </p>
                    </div>
                    <div className="p-4 bg-muted/50 rounded-lg">
                      <h4 className="font-medium mb-2">Edge</h4>
                      <p className="text-sm text-muted-foreground">
                        Settings → Site Permissions → Cookies and site data
                      </p>
                    </div>
                  </div>
                </div>
                
                <div>
                  <h3 className="text-lg font-semibold mb-2">Withdraw Consent</h3>
                  <p className="text-muted-foreground">
                    You can withdraw or update your consent to cookies at any time by adjusting your browser 
                    settings or revisiting our cookie consent banner.
                  </p>
                </div>
                
                <div>
                  <h3 className="text-lg font-semibold mb-2">Third-Party Cookies</h3>
                  <p className="text-muted-foreground">
                    Some of our pages may contain content from third-party services (such as YouTube videos, 
                    Google Maps, or social media widgets) that may set their own cookies. We don't control 
                    these cookies, so please check the relevant third party's website for more information.
                  </p>
                </div>
              </CardContent>
            </Card>

            {/* Contact Information */}
            <Card>
              <CardHeader>
                <CardTitle>Questions About Our Cookie Policy?</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground mb-4">
                  If you have any questions about our use of cookies or this Cookie Policy, please contact us:
                </p>
                <div className="space-y-2 text-sm">
                  <p><strong>Email:</strong> hello@popupgenix.com</p>
                  <p><strong>Phone:</strong> +1 479 689 1012</p>
                  <p><strong>Address:</strong> 1209 MOUNTAIN ROAD PL NE, STE R, ALBUQUERQUE, NM 87110, USA</p>
                </div>
              </CardContent>
            </Card>

            {/* Last Updated */}
            <div className="text-center py-8">
              <p className="text-muted-foreground">
                <strong>Last Updated:</strong> September 2025
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Contact Section */}
      <ContactSection
        title="Still Have Questions?"
        subtitle="Contact us for more information about our cookie policy or data practices."
      />
    </div>
  );
};

export default CookiePolicy;