import { useEffect, useState } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { AdminUser, getCurrentUser, login } from "@/lib/api/auth";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AdminSidebar } from "@/components/AdminPanel/AdminSidebar";
import AdminDashboard from "@/components/AdminPanel/AdminDashboard";
import HomepageManager from "@/components/AdminPanel/HomepageManager";
import ServicesManager from "@/components/AdminPanel/ServicesManager";
import TestimonialManager from "@/components/AdminPanel/TestimonialManager";
import MessagesManager from "@/components/AdminPanel/MessagesManager";
import QuoteRequestsManager from "@/components/AdminPanel/QuoteRequestsManager";
import ClientManager from "@/components/AdminPanel/ClientManager";
import WorkUpdatesManager from "@/components/AdminPanel/WorkUpdatesManager";
import ClientMessagesManager from "@/components/AdminPanel/ClientMessagesManager";
import InvoiceManager from "@/components/AdminPanel/InvoiceManager";
import InvoiceForm from "@/components/AdminPanel/InvoiceForm";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const ADMIN_EMAIL = "shahedalfahad19@gmail.com";

export default function AdminPanel() {
  const { toast } = useToast();
  const [user, setUser] = useState<AdminUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  useEffect(() => {
    getCurrentUser().then((currentUser) => {
      if (currentUser?.email === ADMIN_EMAIL) {
        setUser(currentUser);
        setIsAdmin(true);
      }
      setLoading(false);
    });
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();

    setIsLoggingIn(true);
    try {
      const loggedInUser = await login(email, password);

      if (loggedInUser.email !== ADMIN_EMAIL) {
        throw new Error("This account is not authorized for admin access.");
      }

      setUser(loggedInUser);
      setIsAdmin(true);

      toast({
        title: "Success",
        description: "Logged in successfully",
      });
    } catch (error: any) {
      toast({
        title: "Login Failed",
        description: error.message || "Invalid login credentials. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsLoggingIn(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-midnight-dark via-midnight to-midnight-light">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-neon-purple"></div>
      </div>
    );
  }

  if (!user || !isAdmin) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-midnight-dark via-midnight to-midnight-light flex items-center justify-center p-6">
        <div className="w-full max-w-md space-y-8">
          <div className="text-center">
            <h1 className="text-3xl font-bold bg-gradient-to-r from-neon-purple to-neon-blue bg-clip-text text-transparent mb-2">
              Admin Login
            </h1>
            <p className="text-gray-300">Access the PopupGenix admin dashboard</p>
          </div>
          
          <Card className="p-8 bg-midnight-light/50 border border-gray-700 backdrop-blur-sm">
            <form onSubmit={handleLogin} className="space-y-6">
              <div className="space-y-2">
                <label htmlFor="email" className="text-sm font-medium text-foreground/70">
                  Email
                </label>
                <Input
                  id="email"
                  type="email"
                  placeholder="Enter your email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  disabled={isLoggingIn}
                  className="bg-background text-foreground placeholder:text-muted-foreground border-border"
                />
              </div>
              <div className="space-y-2">
                <label htmlFor="password" className="text-sm font-medium text-foreground/70">
                  Password
                </label>
                <Input
                  id="password"
                  type="password"
                  placeholder="Enter your password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  disabled={isLoggingIn}
                  className="bg-background text-foreground placeholder:text-muted-foreground border-border"
                />
              </div>
              <Button 
                type="submit" 
                className="w-full bg-gradient-to-r from-neon-purple to-neon-blue hover:opacity-90" 
                disabled={isLoggingIn}
              >
                {isLoggingIn ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Logging in...
                  </>
                ) : (
                  "Login"
                )}
              </Button>
            </form>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-midnight-dark via-midnight to-midnight-light">
      <SidebarProvider defaultOpen>
        <div className="flex min-h-screen w-full">
          <AdminSidebar />
          
          <main className="flex-1">
            {/* Global Header */}
            <header className="h-16 flex items-center border-b border-gray-700 bg-midnight-light/80 backdrop-blur-sm px-6">
              <SidebarTrigger className="text-gray-300 hover:text-white" />
              <div className="ml-4">
                <h2 className="text-white font-semibold">PopupGenix Admin Dashboard</h2>
              </div>
            </header>

            {/* Page Content */}
            <div className="p-6">
                <Routes>
                  <Route path="/" element={<AdminDashboard />} />
                  <Route path="/homepage" element={<HomepageManager />} />
                  <Route path="/services" element={<ServicesManager />} />
                  <Route path="/work-updates" element={<WorkUpdatesManager />} />
                  <Route path="/client-messages" element={<ClientMessagesManager />} />
                  <Route path="/messages" element={<MessagesManager />} />
                  <Route path="/quotes" element={<QuoteRequestsManager />} />
                  <Route path="/invoices" element={<InvoiceManager />} />
                  <Route path="/invoices/create" element={<InvoiceForm />} />
                  <Route path="/testimonials" element={<TestimonialManager />} />
                  <Route path="/clients" element={<ClientManager />} />
                  <Route path="*" element={<Navigate to="/admin" replace />} />
                </Routes>
            </div>
          </main>
        </div>
      </SidebarProvider>
    </div>
  );
}