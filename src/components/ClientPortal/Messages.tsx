import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Loader2, Send, User, MessageCircle } from "lucide-react";

interface Message {
  id: string;
  message_text: string;
  sender_type: "admin" | "client";
  is_read: boolean;
  created_at: string;
}

export default function Messages() {
  const { toast } = useToast();
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [messageText, setMessageText] = useState("");
  const [sending, setSending] = useState(false);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [projectTitle, setProjectTitle] = useState("");

  useEffect(() => {
    loadMessages();

    const channel = supabase
      .channel("messages-updates")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "messages",
        },
        () => {
          loadMessages();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const loadMessages = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: projects, error: projectError } = await supabase
        .from("projects")
        .select("id, title")
        .eq("client_user_id", user.id)
        .single();

      if (projectError) throw projectError;

      setProjectId(projects.id);
      setProjectTitle(projects.title);

      const { data, error } = await supabase
        .from("messages")
        .select("*")
        .eq("project_id", projects.id)
        .order("created_at", { ascending: true });

      if (error) throw error;
      setMessages(data || []);
    } catch (error: any) {
      console.error("Error loading messages:", error);
    } finally {
      setLoading(false);
    }
  };

  const sendMessage = async () => {
    if (!messageText.trim() || !projectId) return;

    setSending(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { error } = await supabase.from("messages").insert({
        project_id: projectId,
        sender_type: "client",
        sender_id: user.id,
        message_text: messageText,
      });

      if (error) throw error;

      // Get user's name and email for notification
      const { data: profile } = await supabase
        .from("profiles")
        .select("full_name, email")
        .eq("user_id", user.id)
        .single();

      // Send notification email
      await supabase.functions.invoke("notify-client-reply", {
        body: {
          clientName: profile?.full_name || profile?.email || "Client",
          clientEmail: profile?.email || "",
          message: messageText,
          projectTitle: projectTitle,
        },
      });

      toast({
        title: "Success",
        description: "Message sent successfully",
      });

      setMessageText("");
      loadMessages();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setSending(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-8 w-8 animate-spin text-neon-purple" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-white mb-2">Messages</h2>
        <p className="text-gray-300">Communicate with your project manager</p>
      </div>

      <Card className="p-6 bg-midnight-light/50 border-gray-700">
        <div className="space-y-4 mb-6 max-h-96 overflow-y-auto">
          {messages.length === 0 ? (
            <p className="text-gray-400 text-center py-8">No messages yet. Start a conversation!</p>
          ) : (
            messages.map((message) => (
              <div
                key={message.id}
                className={`p-4 rounded-lg ${
                  message.sender_type === "admin"
                    ? "bg-neon-purple/20 border border-neon-purple/30"
                    : "bg-midnight border border-gray-600"
                }`}
              >
                <div className="flex items-start gap-3">
                  <div className="mt-1">
                    {message.sender_type === "admin" ? (
                      <MessageCircle className="h-5 w-5 text-neon-purple" />
                    ) : (
                      <User className="h-5 w-5 text-gray-400" />
                    )}
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-sm font-medium text-white">
                        {message.sender_type === "admin" ? "Admin" : "You"}
                      </span>
                    </div>
                    <p className="text-gray-300 text-sm whitespace-pre-wrap">{message.message_text}</p>
                    <p className="text-xs text-gray-500 mt-2">
                      {new Date(message.created_at).toLocaleString()}
                    </p>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        <div className="space-y-2">
          <Textarea
            value={messageText}
            onChange={(e) => setMessageText(e.target.value)}
            placeholder="Type your message..."
            rows={3}
            className="bg-background text-foreground placeholder:text-muted-foreground border-border"
          />
          <Button
            onClick={sendMessage}
            disabled={sending || !messageText.trim()}
            className="w-full bg-gradient-to-r from-neon-purple to-neon-blue"
          >
            {sending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Sending...
              </>
            ) : (
              <>
                <Send className="mr-2 h-4 w-4" />
                Send Message
              </>
            )}
          </Button>
        </div>
      </Card>
    </div>
  );
}
