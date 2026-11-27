import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, Send, User, MessageCircle } from "lucide-react";

interface Message {
  id: string;
  message_text: string;
  sender_type: "admin" | "client";
  is_read: boolean;
  created_at: string;
  sender_id: string;
  project_id: string;
  projects: {
    title: string;
    client_name: string;
  } | null;
  profiles: {
    full_name: string;
    email: string;
  } | null;
}

export default function ClientMessagesManager() {
  const { toast } = useToast();
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [replyText, setReplyText] = useState("");
  const [sending, setSending] = useState(false);

  useEffect(() => {
    loadMessages();
    
    const channel = supabase
      .channel("messages-changes")
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
      // First get messages with projects
      const { data: messagesData, error: messagesError } = await supabase
        .from("messages")
        .select("*, projects(title, client_name)")
        .order("created_at", { ascending: false });

      if (messagesError) throw messagesError;

      // Get unique sender IDs
      const senderIds = [...new Set(messagesData?.map(m => m.sender_id) || [])];

      // Get profiles for all senders
      const { data: profilesData, error: profilesError } = await supabase
        .from("profiles")
        .select("user_id, full_name, email")
        .in("user_id", senderIds);

      if (profilesError) throw profilesError;

      // Create a map of user_id to profile
      const profilesMap = new Map(profilesData?.map(p => [p.user_id, p]) || []);

      // Combine the data
      const enrichedMessages = messagesData?.map(msg => ({
        ...msg,
        profiles: profilesMap.get(msg.sender_id) || null
      }));

      setMessages(enrichedMessages || []);
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const markAsRead = async (messageId: string) => {
    try {
      const { error } = await supabase
        .from("messages")
        .update({ is_read: true })
        .eq("id", messageId);

      if (error) throw error;
      loadMessages();
    } catch (error: any) {
      console.error("Error marking as read:", error);
    }
  };

  const sendReply = async (projectId: string) => {
    if (!replyText.trim()) return;

    setSending(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { error } = await supabase.from("messages").insert({
        project_id: projectId,
        sender_type: "admin",
        sender_id: user.id,
        message_text: replyText,
      });

      if (error) throw error;

      toast({
        title: "Success",
        description: "Reply sent successfully",
      });

      setReplyText("");
      setReplyTo(null);
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

  const groupedMessages = messages.reduce((acc, msg) => {
    if (!msg.projects) return acc;
    if (!acc[msg.project_id]) {
      acc[msg.project_id] = {
        project: msg.projects,
        messages: [],
      };
    }
    acc[msg.project_id].messages.push(msg);
    return acc;
  }, {} as Record<string, { project: any; messages: Message[] }>);

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
        <h2 className="text-2xl font-bold text-white mb-2">Client Messages</h2>
        <p className="text-gray-300">View and respond to client messages</p>
      </div>

      {Object.keys(groupedMessages).length === 0 ? (
        <Card className="p-8 bg-midnight-light/50 border-gray-700">
          <p className="text-gray-400 text-center">No messages yet</p>
        </Card>
      ) : (
        Object.entries(groupedMessages).map(([projectId, { project, messages: projectMessages }]) => (
          <Card key={projectId} className="p-6 bg-midnight-light/50 border-gray-700">
            <div className="mb-4">
              <h3 className="text-xl font-semibold text-white">{project.title}</h3>
              <p className="text-sm text-gray-400">Client: {project.client_name}</p>
            </div>

            <div className="space-y-3 mb-4 max-h-96 overflow-y-auto">
              {projectMessages.map((message) => (
                <div
                  key={message.id}
                  className={`p-4 rounded-lg ${
                    message.sender_type === "client"
                      ? "bg-midnight border border-gray-600"
                      : "bg-neon-purple/20 border border-neon-purple/30"
                  }`}
                  onClick={() => message.sender_type === "client" && !message.is_read && markAsRead(message.id)}
                >
                  <div className="flex items-start gap-3">
                    <div className="mt-1">
                      {message.sender_type === "client" ? (
                        <User className="h-5 w-5 text-gray-400" />
                      ) : (
                        <MessageCircle className="h-5 w-5 text-neon-purple" />
                      )}
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-sm font-medium text-white">
                          {message.sender_type === "client" 
                            ? (message.profiles?.full_name || message.profiles?.email || "Client")
                            : "You (Admin)"}
                        </span>
                        {message.sender_type === "client" && !message.is_read && (
                          <Badge variant="destructive" className="text-xs">New</Badge>
                        )}
                      </div>
                      <p className="text-gray-300 text-sm whitespace-pre-wrap">{message.message_text}</p>
                      <p className="text-xs text-gray-500 mt-2">
                        {new Date(message.created_at).toLocaleString()}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {replyTo === projectId ? (
              <div className="space-y-2">
            <Textarea
              value={replyText}
              onChange={(e) => setReplyText(e.target.value)}
              placeholder="Type your reply..."
              rows={3}
              className="bg-background text-foreground placeholder:text-muted-foreground border-border"
            />
                <div className="flex gap-2">
                  <Button
                    onClick={() => sendReply(projectId)}
                    disabled={sending}
                    className="bg-gradient-to-r from-neon-purple to-neon-blue"
                  >
                    {sending ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Sending...
                      </>
                    ) : (
                      <>
                        <Send className="mr-2 h-4 w-4" />
                        Send Reply
                      </>
                    )}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => {
                      setReplyTo(null);
                      setReplyText("");
                    }}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <Button
                onClick={() => setReplyTo(projectId)}
                variant="outline"
                className="w-full"
              >
                <MessageCircle className="mr-2 h-4 w-4" />
                Reply
              </Button>
            )}
          </Card>
        ))
      )}
    </div>
  );
}
