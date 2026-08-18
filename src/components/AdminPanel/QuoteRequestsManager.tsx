import { useEffect, useState } from "react";
import { deleteQuoteRequest, listQuoteRequests } from "@/lib/api/quoteRequests";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";

interface QuoteRequest {
  id: string;
  created_at: string;
  name: string;
  email: string;
  phone: string | null;
  company: string | null;
  project_type: string;
  budget_range: string;
  status: string;
  project_description: string;
}

export default function QuoteRequestsManager() {
  const [quotes, setQuotes] = useState<QuoteRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<string[]>([]);
  const { toast } = useToast();

  useEffect(() => {
    loadQuotes();
  }, []);

  const loadQuotes = async () => {
    try {
      const data = await listQuoteRequests();
      setQuotes(data);
    } catch (err) {
      console.error("Error loading quotes:", err);
      toast({ title: "Failed to load quotes", description: "Please try again.", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const toggleSelect = (id: string) => {
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const selectAll = (checked: boolean) => {
    if (checked) setSelected(quotes.map((q) => q.id));
    else setSelected([]);
  };

  const deleteSelected = async () => {
    if (!selected.length) return;
    try {
      await Promise.all(selected.map((id) => deleteQuoteRequest(id)));
      toast({ title: "Deleted", description: "Selected quote requests were deleted." });
      setSelected([]);
      await loadQuotes();
    } catch (err) {
      console.error("Error deleting quotes:", err);
      toast({ title: "Delete failed", description: "Please try again.", variant: "destructive" });
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-white">Quote Requests</h1>
        <p className="text-gray-300">View and manage quote submissions from your website.</p>
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
          <CardTitle className="text-white">All Quotes</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-neon-purple"></div>
            </div>
          ) : quotes.length === 0 ? (
            <div className="text-center text-gray-400 py-10">No quote requests yet.</div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>
                      <Checkbox
                        checked={selected.length > 0 && selected.length === quotes.length}
                        onCheckedChange={(checked) => selectAll(Boolean(checked))}
                        aria-label="Select all"
                      />
                    </TableHead>
                    <TableHead className="text-gray-300">Date</TableHead>
                    <TableHead className="text-gray-300">Name</TableHead>
                    <TableHead className="text-gray-300">Email</TableHead>
                    <TableHead className="text-gray-300">Type</TableHead>
                    <TableHead className="text-gray-300">Budget</TableHead>
                    <TableHead className="text-gray-300">Status</TableHead>
                    <TableHead className="text-gray-300">Description</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {quotes.map((q) => (
                    <TableRow key={q.id} className="hover:bg-white/5">
                      <TableCell>
                        <Checkbox
                          checked={selected.includes(q.id)}
                          onCheckedChange={() => toggleSelect(q.id)}
                          aria-label="Select row"
                        />
                      </TableCell>
                      <TableCell className="text-gray-200">{new Date(q.created_at).toLocaleString()}</TableCell>
                      <TableCell className="text-gray-200">{q.name}</TableCell>
                      <TableCell>
                        <a href={`mailto:${q.email}`} className="text-neon-blue hover:underline">
                          {q.email}
                        </a>
                      </TableCell>
                      <TableCell className="text-gray-200">{q.project_type}</TableCell>
                      <TableCell className="text-gray-200">{q.budget_range}</TableCell>
                      <TableCell>
                        <Badge variant="secondary" className="bg-white/10 text-white border border-white/20">
                          {q.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="max-w-[400px] text-gray-200">
                        <div className="line-clamp-3 leading-relaxed">{q.project_description}</div>
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
