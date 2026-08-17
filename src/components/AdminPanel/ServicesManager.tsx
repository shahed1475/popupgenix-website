import { useState, useEffect } from "react";
import { createService, deleteService, listServices, updateService } from "@/lib/api/services";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Plus, Edit2, Trash2, Save, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface Service {
  id: string;
  title: string;
  description: string;
  features: string[];
  icon: string;
  order_index: number;
  active: boolean;
}

const iconOptions = [
  { value: "brain", label: "Brain (AI/ML)" },
  { value: "code", label: "Code (Development)" },
  { value: "globe", label: "Globe (Web)" },
  { value: "smartphone", label: "Smartphone (Mobile)" },
  { value: "database", label: "Database (CRM)" },
  { value: "cloud", label: "Cloud (DevOps)" },
];

export default function ServicesManager() {
  const [services, setServices] = useState<Service[]>([]);
  const [editingService, setEditingService] = useState<Service | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    loadServices();
  }, []);

  const loadServices = async () => {
    try {
      const data = await listServices();
      setServices([...data].sort((a, b) => a.order_index - b.order_index));
    } catch (error) {
      console.error('Error loading services:', error);
      toast({
        title: "Error",
        description: "Failed to load services",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const saveService = async () => {
    if (!editingService) return;

    setSaving(true);
    try {
      const { id, ...fields } = editingService;
      const serviceData = {
        ...fields,
        features: fields.features.filter(f => f.trim() !== '')
      };

      if (id) {
        await updateService(id, serviceData);
      } else {
        await createService({ ...serviceData, order_index: services.length });
      }

      await loadServices();
      setIsDialogOpen(false);
      setEditingService(null);

      toast({
        title: "Success",
        description: `Service ${id ? 'updated' : 'created'} successfully!`,
      });
    } catch (error) {
      console.error('Error saving service:', error);
      toast({
        title: "Error",
        description: "Failed to save service. Please try again.",
        variant: "destructive"
      });
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteService = async (id: string) => {
    if (!confirm('Are you sure you want to delete this service?')) return;

    try {
      await deleteService(id);
      await loadServices();
      toast({
        title: "Success",
        description: "Service deleted successfully!",
      });
    } catch (error) {
      console.error('Error deleting service:', error);
      toast({
        title: "Error",
        description: "Failed to delete service. Please try again.",
        variant: "destructive"
      });
    }
  };

  const toggleServiceStatus = async (service: Service) => {
    try {
      await updateService(service.id, { active: !service.active });
      await loadServices();
    } catch (error) {
      console.error('Error updating service status:', error);
      toast({
        title: "Error",
        description: "Failed to update service status",
        variant: "destructive"
      });
    }
  };

  const openEditDialog = (service?: Service) => {
    setEditingService(service || {
      id: '',
      title: '',
      description: '',
      features: [''],
      icon: 'code',
      order_index: services.length,
      active: true
    });
    setIsDialogOpen(true);
  };

  const updateFeature = (index: number, value: string) => {
    if (!editingService) return;
    const newFeatures = [...editingService.features];
    newFeatures[index] = value;
    setEditingService({ ...editingService, features: newFeatures });
  };

  const addFeature = () => {
    if (!editingService) return;
    setEditingService({ 
      ...editingService, 
      features: [...editingService.features, ''] 
    });
  };

  const removeFeature = (index: number) => {
    if (!editingService) return;
    const newFeatures = editingService.features.filter((_, i) => i !== index);
    setEditingService({ ...editingService, features: newFeatures });
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
        <h1 className="text-3xl font-bold text-white">Services Manager</h1>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button 
              onClick={() => openEditDialog()}
              className="bg-gradient-to-r from-neon-purple to-neon-blue hover:from-neon-purple/80 hover:to-neon-blue/80"
            >
              <Plus className="h-4 w-4 mr-2" />
              Add Service
            </Button>
          </DialogTrigger>
          
          {/* Edit Dialog */}
          <DialogContent className="bg-midnight-light border-gray-700 max-w-2xl max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="text-white">
                {editingService?.id ? 'Edit Service' : 'Add New Service'}
              </DialogTitle>
            </DialogHeader>

            {editingService && (
              <div className="space-y-6">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label className="text-gray-300">Service Title</Label>
                    <Input
                      value={editingService.title}
                      onChange={(e) => setEditingService({ ...editingService, title: e.target.value })}
                      className="bg-midnight border-gray-600 text-white"
                      placeholder="Enter service title"
                    />
                  </div>
                  <div>
                    <Label className="text-gray-300">Icon</Label>
                    <select
                      value={editingService.icon}
                      onChange={(e) => setEditingService({ ...editingService, icon: e.target.value })}
                      className="w-full p-2 bg-midnight border border-gray-600 text-white rounded-md"
                    >
                      {iconOptions.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div>
                  <Label className="text-gray-300">Description</Label>
                  <Textarea
                    value={editingService.description}
                    onChange={(e) => setEditingService({ ...editingService, description: e.target.value })}
                    className="bg-midnight border-gray-600 text-white"
                    rows={3}
                    placeholder="Enter service description"
                  />
                </div>

                <div>
                  <Label className="text-gray-300">Features</Label>
                  <div className="space-y-2">
                    {editingService.features.map((feature, index) => (
                      <div key={index} className="flex gap-2">
                        <Input
                          value={feature}
                          onChange={(e) => updateFeature(index, e.target.value)}
                          className="bg-midnight border-gray-600 text-white"
                          placeholder="Enter feature"
                        />
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => removeFeature(index)}
                          className="border-red-600 text-red-400 hover:bg-red-600/20"
                        >
                          <X className="h-3 w-3" />
                        </Button>
                      </div>
                    ))}
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={addFeature}
                      className="border-gray-600"
                    >
                      <Plus className="h-3 w-3 mr-1" />
                      Add Feature
                    </Button>
                  </div>
                </div>

                <div className="flex justify-end gap-2">
                  <Button
                    variant="outline"
                    onClick={() => setIsDialogOpen(false)}
                    className="border-gray-600"
                  >
                    Cancel
                  </Button>
                  <Button
                    onClick={saveService}
                    disabled={saving}
                    className="bg-gradient-to-r from-neon-purple to-neon-blue"
                  >
                    {saving ? "Saving..." : "Save Service"}
                  </Button>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>

      {/* Services Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {services.map((service) => (
          <Card key={service.id} className="bg-midnight-light/50 border-gray-700">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-white text-lg">{service.title}</CardTitle>
                <Badge variant={service.active ? "default" : "secondary"} className="text-xs">
                  {service.active ? "Active" : "Inactive"}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-gray-300 text-sm">{service.description}</p>
              
              <div className="space-y-2">
                <h4 className="text-white font-medium text-sm">Features:</h4>
                <div className="flex flex-wrap gap-1">
                  {service.features.slice(0, 3).map((feature, index) => (
                    <Badge key={index} variant="outline" className="text-xs">
                      {feature}
                    </Badge>
                  ))}
                  {service.features.length > 3 && (
                    <Badge variant="outline" className="text-xs">
                      +{service.features.length - 3} more
                    </Badge>
                  )}
                </div>
              </div>

              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => openEditDialog(service)}
                  className="flex-1 border-gray-600"
                >
                  <Edit2 className="h-3 w-3 mr-1" />
                  Edit
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => toggleServiceStatus(service)}
                  className={`border-gray-600 ${service.active ? 'text-yellow-400' : 'text-green-400'}`}
                >
                  {service.active ? 'Deactivate' : 'Activate'}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleDeleteService(service.id)}
                  className="border-red-600 text-red-400 hover:bg-red-600/10"
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}