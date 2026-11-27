import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Download, File, FileText, Receipt, Calendar } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface Document {
  id: string;
  name: string;
  type: 'contract' | 'design' | 'invoice' | 'other';
  file_url: string;
  uploaded_at: string;
  project_id: string;
}

export default function FilesDocuments() {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    getDocuments();
  }, []);

  const getDocuments = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        // Get user's project first
        const { data: projects } = await supabase
          .from('projects')
          .select('id')
          .eq('client_id', user.id);

        if (projects && projects.length > 0) {
          const { data: docs } = await supabase
            .from('documents')
            .select('*')
            .eq('project_id', projects[0].id)
            .order('uploaded_at', { ascending: false });

          setDocuments(docs || []);
        }
      }
    } catch (error) {
      console.error('Error fetching documents:', error);
      toast({
        title: "Error",
        description: "Failed to load documents",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const downloadDocument = async (doc: Document) => {
    try {
      const { data } = await supabase.storage
        .from('documents')
        .download(doc.file_url);

      if (data) {
        const url = URL.createObjectURL(data);
        const a = document.createElement('a');
        a.href = url;
        a.download = doc.name;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }
    } catch (error) {
      console.error('Error downloading document:', error);
      toast({
        title: "Error",
        description: "Failed to download document",
        variant: "destructive"
      });
    }
  };

  const getDocumentIcon = (type: string) => {
    switch (type) {
      case 'contract':
        return <FileText className="h-5 w-5 text-neon-purple" />;
      case 'design':
        return <File className="h-5 w-5 text-neon-blue" />;
      case 'invoice':
        return <Receipt className="h-5 w-5 text-accent" />;
      default:
        return <File className="h-5 w-5 text-gray-400" />;
    }
  };

  const getTypeColor = (type: string) => {
    switch (type) {
      case 'contract':
        return 'bg-neon-purple/10 text-neon-purple border-neon-purple/20';
      case 'design':
        return 'bg-neon-blue/10 text-neon-blue border-neon-blue/20';
      case 'invoice':
        return 'bg-primary/10 text-accent border-primary/20';
      default:
        return 'bg-gray-500/10 text-gray-400 border-gray-500/20';
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-midnight-dark via-midnight to-midnight-light">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-neon-purple"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-midnight-dark via-midnight to-midnight-light p-6">
      <div className="max-w-6xl mx-auto space-y-8">
        {/* Header */}
        <div className="text-center space-y-4">
          <h1 className="text-4xl font-bold bg-gradient-to-r from-neon-purple to-neon-blue bg-clip-text text-transparent">
            Files & Documents
          </h1>
          <p className="text-gray-300 text-lg">Access your project files, contracts, and invoices</p>
        </div>

        {/* Documents Grid */}
        {documents.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {documents.map((doc) => (
              <Card key={doc.id} className="bg-midnight-light/50 border-gray-700 backdrop-blur-sm hover:border-neon-purple/30 transition-all duration-300">
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-3 text-white text-lg">
                    {getDocumentIcon(doc.type)}
                    <span className="truncate">{doc.name}</span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center justify-between">
                    <Badge className={getTypeColor(doc.type)}>
                      {doc.type.charAt(0).toUpperCase() + doc.type.slice(1)}
                    </Badge>
                  </div>
                  
                  <div className="flex items-center gap-2 text-sm text-gray-300">
                    <Calendar className="h-4 w-4" />
                    <span>{new Date(doc.uploaded_at).toLocaleDateString()}</span>
                  </div>

                  <Button
                    onClick={() => downloadDocument(doc)}
                    className="w-full bg-gradient-to-r from-neon-purple to-neon-blue hover:from-neon-purple/80 hover:to-neon-blue/80"
                  >
                    <Download className="h-4 w-4 mr-2" />
                    Download
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <Card className="bg-midnight-light/50 border-gray-700 backdrop-blur-sm">
            <CardContent className="text-center py-12">
              <File className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-xl font-semibold text-white mb-2">No Documents Yet</h3>
              <p className="text-gray-300">
                Your project documents will appear here once they're uploaded by our team.
              </p>
            </CardContent>
          </Card>
        )}

        {/* File Types Info */}
        <Card className="bg-midnight-light/30 border-gray-700/50">
          <CardHeader>
            <CardTitle className="text-white">Document Types</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
              <div className="flex items-center gap-3">
                <FileText className="h-5 w-5 text-neon-purple" />
                <div>
                  <div className="font-medium text-white">Contracts</div>
                  <div className="text-gray-300">Project agreements and terms</div>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <File className="h-5 w-5 text-neon-blue" />
                <div>
                  <div className="font-medium text-white">Designs</div>
                  <div className="text-gray-300">UI/UX mockups and prototypes</div>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Receipt className="h-5 w-5 text-accent" />
                <div>
                  <div className="font-medium text-white">Invoices</div>
                  <div className="text-gray-300">Payment documents and receipts</div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}