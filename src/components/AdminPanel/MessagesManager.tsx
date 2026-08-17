import { useEffect, useState } from "react";
import { deleteContactSubmission, listContactSubmissions } from "@/lib/api/contactSubmissions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";

interface ContactMessage {
  id: string;
  created_at: string;
  name: string;
  email: string;
  budget_range: string | null;
  message: string;
  status: string;
  priority: string;
}

export default function MessagesManager() {
  const [messages, setMessages] = useState<ContactMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<string[]>([]);
  const { toast } = useToast();

  useEffect(() => {
    loadMessages();
  }, []);

  const loadMessages = async () => {
    try {
      const data = await listContactSubmissions();
      setMessages(data);
    } catch (err) {
      console.error("Error loading messages:", err);
      toast({
        title: "Failed to load messages",
        description: "Please try again.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const toggleSelect = (id: string) => {
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const selectAll = (checked: boolean) => {
    if (checked) {
      setSelected(messages.map((m) => m.id));
    } else {
      setSelected([]);
    }
  };

  const deleteSelected = async () => {
    if (selected.length === 0) return;
    try {
      await Promise.all(selected.map((id) => deleteContactSubmission(id)));
      toast({ title: "Deleted", description: "Selected messages were deleted." });
      setSelected([]);
      await loadMessages();
    } catch (err) {
      console.error("Error deleting messages:", err);
      toast({ title: "Delete failed", description: "Please try again.", variant: "destructive" });
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-white">Client Messages</h1>
        <p className="text-gray-300">View contact form submissions from your website visitors.</p>
      </div>
      <div className="flex items-center justify-between">
        <p className="text-gray-400 text-sm">{selected.length} selected</p>
        <Button
          onClick={deleteSelected}
          disabled={selected.length === 0}
          className="bg-red-600 hover:bg-red-700 text-white disabled:opacity-50"
        >
          Delete selected
        </Button>
      </div>

      <Card className="bg-midnight-light/50 border-gray-700">
        <CardHeader>
          <CardTitle className="text-white">All Messages</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-neon-purple"></div>
            </div>
          ) : messages.length === 0 ? (
            <div className="text-center text-gray-400 py-10">No messages yet.</div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>
                      <Checkbox
                        checked={selected.length > 0 && selected.length === messages.length}
                        onCheckedChange={(checked) => selectAll(Boolean(checked))}
                        aria-label="Select all"
                      />
                    </TableHead>
                    <TableHead className="text-gray-300">Date</TableHead>
                    <TableHead className="text-gray-300">Name</TableHead>
                    <TableHead className="text-gray-300">Email</TableHead>
                    <TableHead className="text-gray-300">Budget</TableHead>
                    <TableHead className="text-gray-300">Status</TableHead>
                    <TableHead className="text-gray-300">Priority</TableHead>
                    <TableHead className="text-gray-300">Message</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                    {messages.map((m) => (
                      <TableRow key={m.id} className="hover:bg-white/5">
                        <TableCell>
                          <Checkbox
                            checked={selected.includes(m.id)}
                            onCheckedChange={() => toggleSelect(m.id)}
                            aria-label="Select row"
                          />
                        </TableCell>
                        <TableCell className="text-gray-200">
                          {new Date(m.created_at).toLocaleString()}
                        </TableCell>
                      <TableCell className="text-gray-200">{m.name}</TableCell>
                      <TableCell>
                        <a href={`mailto:${m.email}`} className="text-neon-blue hover:underline">
                          {m.email}
                        </a>
                      </TableCell>
                      <TableCell className="text-gray-200">{m.budget_range || "-"}</TableCell>
                      <TableCell>
                        <Badge variant="secondary" className="bg-white/10 text-white border border-white/20">
                          {m.status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary" className="bg-white/10 text-white border border-white/20">
                          {m.priority}
                        </Badge>
                      </TableCell>
                      <TableCell className="max-w-[400px] text-gray-200">
                        <div className="line-clamp-3 leading-relaxed">{m.message}</div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
