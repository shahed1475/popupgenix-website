import { useState, useEffect } from "react";
import { getHomepageContent, saveHomepageContent } from "@/lib/api/homepageContent";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Save, RotateCcw, Home } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface HomepageContent {
  id: string;
  hero_title: string;
  hero_subtitle: string;
  hero_cta_primary: string;
  hero_cta_secondary: string;
  clients_count: number;
  projects_count: number;
  satisfaction_rate: number;
  team_size: number;
  about_title: string;
  about_description: string;
}

export default function HomepageManager() {
  const [content, setContent] = useState<HomepageContent>({
    id: '',
    hero_title: "Transform Your Ideas Into Digital Reality",
    hero_subtitle: "We create stunning websites, mobile apps, and AI solutions that drive your business forward.",
    hero_cta_primary: "Get Started",
    hero_cta_secondary: "View Our Work",
    clients_count: 150,
    projects_count: 200,
    satisfaction_rate: 98,
    team_size: 15,
    about_title: "About PopupGenix",
    about_description: "We are a team of passionate developers and designers who specialize in creating innovative digital solutions."
  });
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    loadHomepageContent();
  }, []);

  const loadHomepageContent = async () => {
    setLoading(true);
    try {
      const data = await getHomepageContent();
      if (data) {
        setContent(data);
      }
    } catch (error) {
      console.error('Error loading homepage content:', error);
      toast({
        title: "Error",
        description: "Failed to load homepage content.",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const saveContent = async () => {
    setSaving(true);
    try {
      const { id, ...input } = content;
      const saved = await saveHomepageContent(input);
      setContent(saved);

      toast({
        title: "Success",
        description: "Homepage content updated successfully!",
      });
    } catch (error) {
      console.error('Error saving content:', error);
      toast({
        title: "Error",
        description: "Failed to save content. Please try again.",
        variant: "destructive"
      });
    } finally {
      setSaving(false);
    }
  };

  const resetToDefaults = () => {
    setContent({
      id: content.id,
      hero_title: "Transform Your Ideas Into Digital Reality",
      hero_subtitle: "We create stunning websites, mobile apps, and AI solutions that drive your business forward.",
      hero_cta_primary: "Get Started",
      hero_cta_secondary: "View Our Work",
      clients_count: 150,
      projects_count: 200,
      satisfaction_rate: 98,
      team_size: 15,
      about_title: "About PopupGenix",
      about_description: "We are a team of passionate developers and designers who specialize in creating innovative digital solutions."
    });
    toast({
      title: "Reset",
      description: "Fields have been reset to default values. Click 'Save Changes' to persist.",
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-neon-purple"></div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Home className="h-6 w-6 text-neon-purple" />
          <h1 className="text-3xl font-bold text-white">Homepage Manager</h1>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={resetToDefaults}
            className="border-gray-600 text-gray-300 hover:bg-gray-700"
          >
            <RotateCcw className="h-4 w-4 mr-2" />
            Reset to Defaults
          </Button>
          <Button
            onClick={saveContent}
            disabled={saving}
            className="bg-gradient-to-r from-neon-purple to-neon-blue hover:from-neon-purple/80 hover:to-neon-blue/80"
          >
            <Save className="h-4 w-4 mr-2" />
            {saving ? "Saving..." : "Save Changes"}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Hero Section */}
        <Card className="bg-midnight-light/50 border-gray-700">
          <CardHeader>
            <CardTitle className="text-white">Hero Section</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="hero_title" className="text-gray-300">Hero Title</Label>
              <Input
                id="hero_title"
                value={content.hero_title}
                onChange={(e) => {
                  console.log('Hero title changed:', e.target.value);
                  setContent({ ...content, hero_title: e.target.value });
                }}
                className="bg-midnight/50 border-gray-600"
              />
            </div>
            <div>
              <Label htmlFor="hero_subtitle" className="text-gray-300">Hero Subtitle</Label>
              <Textarea
                id="hero_subtitle"
                value={content.hero_subtitle}
                onChange={(e) => setContent({ ...content, hero_subtitle: e.target.value })}
                className="bg-midnight/50 border-gray-600"
                rows={3}
              />
            </div>
          </CardContent>
        </Card>

        {/* Stats Section */}
        <Card className="bg-midnight-light/50 border-gray-700">
          <CardHeader>
            <CardTitle className="text-white">Stats Section</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="projects_count" className="text-gray-300">Projects Count</Label>
              <Input
                id="projects_count"
                type="number"
                value={content.projects_count}
                onChange={(e) => setContent({ ...content, projects_count: parseInt(e.target.value) || 0 })}
                className="bg-midnight/50 border-gray-600"
              />
            </div>
            <div>
              <Label htmlFor="clients_count" className="text-gray-300">Clients Count</Label>
              <Input
                id="clients_count"
                type="number"
                value={content.clients_count}
                onChange={(e) => setContent({ ...content, clients_count: parseInt(e.target.value) || 0 })}
                className="bg-midnight/50 border-gray-600"
              />
            </div>
            <div>
              <Label htmlFor="satisfaction_rate" className="text-gray-300">Satisfaction Rate (%)</Label>
              <Input
                id="satisfaction_rate"
                type="number"
                value={content.satisfaction_rate}
                onChange={(e) => setContent({ ...content, satisfaction_rate: parseInt(e.target.value) || 0 })}
                className="bg-midnight/50 border-gray-600"
              />
            </div>
            <div>
              <Label htmlFor="team_size" className="text-gray-300">Team Size</Label>
              <Input
                id="team_size"
                type="number"
                value={content.team_size}
                onChange={(e) => setContent({ ...content, team_size: parseInt(e.target.value) || 0 })}
                className="bg-midnight/50 border-gray-600"
              />
            </div>
          </CardContent>
        </Card>

        {/* CTA Buttons */}
        <Card className="bg-midnight-light/50 border-gray-700">
          <CardHeader>
            <CardTitle className="text-white">Call-to-Action Buttons</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="hero_cta_primary" className="text-gray-300">Primary CTA Text</Label>
              <Input
                id="hero_cta_primary"
                value={content.hero_cta_primary}
                onChange={(e) => setContent({ ...content, hero_cta_primary: e.target.value })}
                className="bg-midnight/50 border-gray-600"
              />
            </div>
            <div>
              <Label htmlFor="hero_cta_secondary" className="text-gray-300">Secondary CTA Text</Label>
              <Input
                id="hero_cta_secondary"
                value={content.hero_cta_secondary}
                onChange={(e) => setContent({ ...content, hero_cta_secondary: e.target.value })}
                className="bg-midnight/50 border-gray-600"
              />
            </div>
          </CardContent>
        </Card>

        {/* About Section */}
        <Card className="bg-midnight-light/50 border-gray-700">
          <CardHeader>
            <CardTitle className="text-white">About Section</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="about_title" className="text-gray-300">About Title</Label>
              <Input
                id="about_title"
                value={content.about_title}
                onChange={(e) => setContent({ ...content, about_title: e.target.value })}
                className="bg-midnight/50 border-gray-600"
              />
            </div>
            <div>
              <Label htmlFor="about_description" className="text-gray-300">About Description</Label>
              <Textarea
                id="about_description"
                value={content.about_description}
                onChange={(e) => setContent({ ...content, about_description: e.target.value })}
                className="bg-midnight/50 border-gray-600"
                rows={4}
              />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Preview */}
      <Card className="bg-gradient-to-br from-neon-purple/10 to-neon-blue/10 border-neon-purple/20">
        <CardHeader>
          <CardTitle className="text-white">Live Preview</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="text-center space-y-2">
            <h2 className="text-2xl font-bold text-white">{content.hero_title}</h2>
            <p className="text-gray-300">{content.hero_subtitle}</p>
          </div>
          <div className="flex justify-center gap-4">
            <span className="px-4 py-2 bg-neon-purple/20 text-neon-purple rounded-lg border border-neon-purple/30">
              {content.hero_cta_primary}
            </span>
            <span className="px-4 py-2 bg-neon-blue/20 text-neon-blue rounded-lg border border-neon-blue/30">
              {content.hero_cta_secondary}
            </span>
          </div>
          <div className="grid grid-cols-4 gap-4 text-center">
            <div>
              <div className="text-2xl font-bold text-neon-purple">{content.projects_count}+</div>
              <div className="text-gray-300 text-sm">Projects</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-neon-blue">{content.clients_count}+</div>
              <div className="text-gray-300 text-sm">Clients</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-purple-400">{content.satisfaction_rate}%</div>
              <div className="text-gray-300 text-sm">Satisfaction</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-pink-400">{content.team_size}+</div>
              <div className="text-gray-300 text-sm">Team Size</div>
            </div>
          </div>
          <div className="pt-4 border-t border-gray-700">
            <h3 className="text-lg font-semibold text-white mb-2">{content.about_title}</h3>
            <p className="text-gray-300 text-sm">{content.about_description}</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}