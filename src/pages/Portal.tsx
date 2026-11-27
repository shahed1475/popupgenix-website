import { useEffect, useState } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { AdminUser, getCurrentUser, login } from "@/lib/api/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import PortalNavigation from "@/components/ClientPortal/PortalNavigation";
import Dashboard from "@/components/ClientPortal/Dashboard";
import PortalMigrationPending from "@/components/ClientPortal/PortalMigrationPending";
import Feedback from "@/components/ClientPortal/Feedback";

export default function Portal() {
  const { toast } = useToast();
  const [user, setUser] = useState<AdminUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  useEffect(() => {
    getCurrentUser().then((currentUser) => {
      setUser(currentUser);
      setLoading(false);
    });
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoggingIn(true);
    try {
      const loggedInUser = await login(email, password);
      setUser(loggedInUser);
      toast({ title: "Success", description: "Logged in successfully" });
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
        <Loader2 className="h-8 w-8 animate-spin text-neon-purple" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-midnight-dark via-midnight to-midnight-light flex items-center justify-center p-6">
        <div className="w-full max-w-md space-y-8">
          <div className="text-center">
            <h1 className="text-3xl font-bold bg-gradient-to-r from-neon-purple to-neon-blue bg-clip-text text-transparent mb-2">
              Client Portal
            </h1>
            <p className="text-gray-300">Access your project dashboard and files</p>
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
      <PortalNavigation />
      <div className="container mx-auto p-6">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/files" element={<PortalMigrationPending featureName="Files & Documents" />} />
          <Route path="/updates" element={<PortalMigrationPending featureName="Work Updates" />} />
          <Route path="/messages" element={<PortalMigrationPending featureName="Messages" />} />
          <Route path="/feedback" element={<Feedback />} />
          <Route path="*" element={<Navigate to="/portal" replace />} />
        </Routes>
      </div>
    </div>
  );
}
