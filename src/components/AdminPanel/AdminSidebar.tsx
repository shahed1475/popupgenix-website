import { Link, useLocation } from "react-router-dom";
import { 
  Home, 
  Settings, 
  FolderOpen, 
  Users, 
  BarChart3, 
  MessageSquare,
  PenTool,
  LogOut,
  Shield,
  FileText,
  Receipt
} from "lucide-react";
import { Mail } from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import { logout } from "@/lib/api/auth";
import { useToast } from "@/hooks/use-toast";

const adminItems = [
  { title: "Dashboard", url: "/admin", icon: Home },
  { title: "Homepage Manager", url: "/admin/homepage", icon: Settings },
  { title: "Services Manager", url: "/admin/services", icon: PenTool },
  { title: "Work Updates", url: "/admin/work-updates", icon: FolderOpen },
  { title: "Client Messages", url: "/admin/client-messages", icon: MessageSquare },
  { title: "Contact Messages", url: "/admin/messages", icon: Mail },
  { title: "Quote Requests", url: "/admin/quotes", icon: FileText },
  { title: "Invoices", url: "/admin/invoices", icon: Receipt },
  { title: "Client Manager", url: "/admin/clients", icon: Users },
  { title: "Testimonial Manager", url: "/admin/testimonials", icon: MessageSquare },
];

export function AdminSidebar() {
  const { state } = useSidebar();
  const location = useLocation();
  const { toast } = useToast();
  const currentPath = location.pathname;

  const isActive = (path: string) => {
    if (path === "/admin") {
      return currentPath === path;
    }
    return currentPath.startsWith(path);
  };

  const isExpanded = adminItems.some((item) => isActive(item.url));

  const getNavCls = (path: string) =>
    isActive(path) 
      ? "bg-neon-purple/20 text-neon-purple border-l-2 border-neon-purple" 
      : "text-gray-300 hover:bg-white/10 hover:text-white";

  const handleSignOut = () => {
    logout();
    toast({
      title: "Signed out successfully",
      description: "You have been logged out of the admin panel.",
    });
    window.location.href = "/admin";
  };

  return (
    <Sidebar
      className={`${state === "collapsed" ? "w-14" : "w-64"} bg-midnight-light/80 backdrop-blur-sm border-r border-gray-700`}
      collapsible="icon"
    >
      <SidebarTrigger className="m-2 self-end text-gray-300 hover:text-white" />

      <SidebarContent className="bg-transparent">
        {/* Logo */}
        {state === "expanded" && (
          <div className="p-4 border-b border-gray-700">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-gradient-to-r from-neon-purple to-neon-blue rounded-lg flex items-center justify-center">
                <Shield className="h-4 w-4 text-white" />
              </div>
              <span className="text-white font-semibold">Admin Panel</span>
            </div>
          </div>
        )}

        <SidebarGroup>
          <SidebarGroupLabel className="text-gray-400 text-xs uppercase tracking-wider">
            {state === "expanded" && "Management"}
          </SidebarGroupLabel>

          <SidebarGroupContent>
            <SidebarMenu>
              {adminItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild>
                    <Link 
                      to={item.url} 
                      className={`flex items-center gap-3 px-3 py-2 rounded-md transition-all ${getNavCls(item.url)}`}
                    >
                      <item.icon className="h-4 w-4 flex-shrink-0" />
                      {state === "expanded" && <span className="text-sm font-medium">{item.title}</span>}
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {/* Actions */}
        <div className="mt-auto p-4 border-t border-gray-700">
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton asChild>
                <Link 
                  to="/" 
                  className="flex items-center gap-3 px-3 py-2 text-gray-300 hover:bg-white/10 hover:text-white rounded-md transition-all"
                >
                  <Home className="h-4 w-4" />
                  {state === "expanded" && <span className="text-sm">Main Site</span>}
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
            <SidebarMenuItem>
              <SidebarMenuButton asChild>
                <button 
                  onClick={handleSignOut}
                  className="w-full flex items-center gap-3 px-3 py-2 text-gray-300 hover:bg-red-500/10 hover:text-red-400 rounded-md transition-all"
                >
                  <LogOut className="h-4 w-4" />
                  {state === "expanded" && <span className="text-sm">Sign Out</span>}
                </button>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </div>
      </SidebarContent>
    </Sidebar>
  );
}