import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Loader2, Send, FileText, Link as LinkIcon, CheckCircle, Clock } from "lucide-react";

interface Project {
  id: string;
  title: string;
  client_name: string;
}

interface WorkUpdate {
  id: string;
  title: string;
  content: string;
  file_url: string | null;
  link_url: string | null;
  status: string;
  created_at: string;
  project_id: string;
  projects: { title: string; client_name: string } | null;
}

export default function WorkUpdatesManager() {
  const { toast } = useToast();
  const [projects, setProjects] = useState<Project[]>([]);
  const [updates, setUpdates] = useState<WorkUpdate[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  
  const [selectedProject, setSelectedProject] = useState("");
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  const [file, setFile] = useState<File | null>(null);

  useEffect(() => {
    loadProjects();
    loadUpdates();
  }, []);

  const loadProjects = async () => {
    try {
      const { data, error } = await supabase
        .from("projects")
        .select("id, title, client_name")
        .eq("active", true)
        .order("title");

      if (error) throw error;
      setProjects(data || []);
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const loadUpdates = async () => {
    try {
      const { data, error } = await supabase
        .from("client_updates")
        .select("*, projects(title, client_name)")
        .order("created_at", { ascending: false })
        .limit(20);

      if (error) throw error;
      setUpdates((data || []) as any);
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

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
    }
  };

  const uploadFile = async (file: File): Promise<string> => {
    const fileExt = file.name.split(".").pop();
    const fileName = `${Math.random()}.${fileExt}`;
    const filePath = `${fileName}`;

    const { error: uploadError } = await supabase.storage
      .from("documents")
      .upload(filePath, file);

    if (uploadError) throw uploadError;

    const { data } = supabase.storage.from("documents").getPublicUrl(filePath);
    return data.publicUrl;
  };

  const sendUpdate = async () => {
    if (!selectedProject || !title || !content) {
      toast({
        title: "Missing Information",
        description: "Please fill in project, title, and content",
        variant: "destructive",
      });
      return;
    }

    setSending(true);
    try {
      let fileUrl = null;
      if (file) {
        fileUrl = await uploadFile(file);
      }

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { error } = await supabase.from("client_updates").insert({
        project_id: selectedProject,
        admin_id: user.id,
        title,
        content,
        file_url: fileUrl,
        link_url: linkUrl || null,
        status: "pending",
      });

      if (error) throw error;

      toast({
        title: "Success",
        description: "Work update sent successfully",
      });

      setTitle("");
      setContent("");
      setLinkUrl("");
      setFile(null);
      setSelectedProject("");
      loadUpdates();
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

  const updateStatus = async (updateId: string, newStatus: string) => {
    try {
      const { error } = await supabase
        .from("client_updates")
        .update({ status: newStatus })
        .eq("id", updateId);

      if (error) throw error;

      toast({
        title: "Success",
        description: "Status updated",
      });

      loadUpdates();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
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
        <h2 className="text-2xl font-bold text-white mb-2">Work Updates</h2>
        <p className="text-gray-300">Send updates, files, and links to your clients</p>
      </div>

      <Card className="p-6 bg-midnight-light/50 border-gray-700">
        <h3 className="text-xl font-semibold text-white mb-4">Send New Update</h3>
        <div className="space-y-4">
          <div>
            <Label htmlFor="project" className="text-foreground/70">Project</Label>
            <Select value={selectedProject} onValueChange={setSelectedProject}>
              <SelectTrigger id="project" className="bg-background text-foreground border-border">
                <SelectValue placeholder="Select a project" />
              </SelectTrigger>
              <SelectContent>
                {projects.map((project) => (
                  <SelectItem key={project.id} value={project.id}>
                    {project.title} - {project.client_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label htmlFor="title" className="text-foreground/70">Title</Label>
            <Input
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Update title"
              className="bg-background text-foreground placeholder:text-muted-foreground border-border"
            />
          </div>

          <div>
            <Label htmlFor="content" className="text-foreground/70">Message</Label>
            <Textarea
              id="content"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Update details..."
              rows={4}
              className="bg-background text-foreground placeholder:text-muted-foreground border-border"
            />
          </div>

          <div>
            <Label htmlFor="link" className="text-foreground/70">Link (Optional)</Label>
            <Input
              id="link"
              type="url"
              value={linkUrl}
              onChange={(e) => setLinkUrl(e.target.value)}
              placeholder="https://..."
              className="bg-background text-foreground placeholder:text-muted-foreground border-border"
            />
          </div>

          <div>
            <Label htmlFor="file" className="text-foreground/70">File (Optional)</Label>
            <Input
              id="file"
              type="file"
              onChange={handleFileChange}
              className="bg-background text-foreground border-border file:text-foreground"
            />
            {file && <p className="text-sm text-muted-foreground mt-2">{file.name}</p>}
          </div>

          <Button
            onClick={sendUpdate}
            disabled={sending}
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
                Send Update
              </>
            )}
          </Button>
        </div>
      </Card>

      <Card className="p-6 bg-midnight-light/50 border-gray-700">
        <h3 className="text-xl font-semibold text-white mb-4">Recent Updates</h3>
        <div className="space-y-4">
          {updates.length === 0 ? (
            <p className="text-gray-400 text-center py-8">No updates sent yet</p>
          ) : (
            updates.map((update) => (
              <div
                key={update.id}
                className="border border-gray-600 rounded-lg p-4 bg-midnight/50"
              >
                <div className="flex justify-between items-start mb-2">
                  <div>
                    <h4 className="text-white font-semibold">{update.title}</h4>
                    <p className="text-sm text-gray-400">
                      {update.projects?.title} - {update.projects?.client_name}
                    </p>
                  </div>
                  <Badge
                    variant={update.status === "completed" ? "default" : "secondary"}
                    className="ml-2"
                  >
                    {update.status === "completed" ? (
                      <CheckCircle className="h-3 w-3 mr-1" />
                    ) : (
                      <Clock className="h-3 w-3 mr-1" />
                    )}
                    {update.status}
                  </Badge>
                </div>
                <p className="text-gray-300 text-sm mb-2">{update.content}</p>
                <div className="flex gap-2 mb-2">
                  {update.file_url && (
                    <Badge variant="outline" className="text-xs">
                      <FileText className="h-3 w-3 mr-1" />
                      File attached
                    </Badge>
                  )}
                  {update.link_url && (
                    <Badge variant="outline" className="text-xs">
                      <LinkIcon className="h-3 w-3 mr-1" />
                      Link attached
                    </Badge>
                  )}
                </div>
                <div className="flex gap-2 mt-3">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => updateStatus(update.id, "completed")}
                    disabled={update.status === "completed"}
                    className="text-xs"
                  >
                    Mark Complete
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => updateStatus(update.id, "pending")}
                    disabled={update.status === "pending"}
                    className="text-xs"
                  >
                    Mark Pending
                  </Button>
                </div>
                <p className="text-xs text-gray-500 mt-2">
                  {new Date(update.created_at).toLocaleString()}
                </p>
              </div>
            ))
          )}
        </div>
      </Card>
    </div>
  );
}
