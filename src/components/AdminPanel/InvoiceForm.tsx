import { useState } from "react";
import { createInvoice } from "@/lib/api/invoices";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Save, Plus, X, ArrowLeft } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useNavigate } from "react-router-dom";

interface LineItem {
  id: string;
  service_name: string;
  description: string;
  quantity: number;
  rate: number;
  amount: number;
}

export default function InvoiceForm() {
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();
  const navigate = useNavigate();

  const [formData, setFormData] = useState({
    invoice_number: `INV-${Date.now()}`,
    client_name: "",
    client_company: "",
    client_email: "",
    client_phone: "",
    client_address: "",
    issue_date: new Date().toISOString().split("T")[0],
    due_date: "",
    tax: 0,
    discount: 0,
    payment_instructions: "",
  });

  const [lineItems, setLineItems] = useState<LineItem[]>([
    {
      id: crypto.randomUUID(),
      service_name: "",
      description: "",
      quantity: 1,
      rate: 0,
      amount: 0,
    },
  ]);

  const addLineItem = () => {
    setLineItems([
      ...lineItems,
      {
        id: crypto.randomUUID(),
        service_name: "",
        description: "",
        quantity: 1,
        rate: 0,
        amount: 0,
      },
    ]);
  };

  const removeLineItem = (id: string) => {
    setLineItems(lineItems.filter((item) => item.id !== id));
  };

  const updateLineItem = (id: string, field: keyof LineItem, value: string | number) => {
    setLineItems(
      lineItems.map((item) => {
        if (item.id === id) {
          const updated = { ...item, [field]: value };
          if (field === "quantity" || field === "rate") {
            updated.amount = Number(updated.quantity) * Number(updated.rate);
          }
          return updated;
        }
        return item;
      })
    );
  };

  const calculateSubtotal = () => {
    return lineItems.reduce((sum, item) => sum + Number(item.amount), 0);
  };

  const calculateTotal = () => {
    const subtotal = calculateSubtotal();
    const tax = Number(formData.tax);
    const discount = Number(formData.discount);
    return subtotal + tax - discount;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const subtotal = calculateSubtotal();
      const total = calculateTotal();

      await createInvoice({
        ...formData,
        subtotal,
        total,
        status: "pending",
        line_items: lineItems.map((item) => ({
          service_name: item.service_name,
          description: item.description,
          quantity: item.quantity,
          rate: item.rate,
          amount: item.amount,
        })),
      });

      toast({
        title: "Success",
        description: "Invoice created successfully!",
      });

      navigate("/admin/invoices");
    } catch (error) {
      console.error("Error creating invoice:", error);
      toast({
        title: "Error",
        description: "Failed to create invoice. Please try again.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button
          variant="outline"
          onClick={() => navigate("/admin/invoices")}
          className="border-gray-600 text-gray-300 hover:bg-gray-700"
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back
        </Button>
        <h1 className="text-3xl font-bold text-white">Create Invoice</h1>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Invoice Details */}
        <Card className="bg-midnight-light/50 border-gray-700">
          <CardHeader>
            <CardTitle className="text-white">Invoice Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="invoice_number" className="text-gray-300">
                  Invoice Number
                </Label>
                <Input
                  id="invoice_number"
                  value={formData.invoice_number}
                  onChange={(e) =>
                    setFormData({ ...formData, invoice_number: e.target.value })
                  }
                  required
                className="bg-midnight/50 border-gray-600"
                />
              </div>
              <div>
                <Label htmlFor="issue_date" className="text-gray-300">
                  Issue Date
                </Label>
                <Input
                  id="issue_date"
                  type="date"
                  value={formData.issue_date}
                  onChange={(e) =>
                    setFormData({ ...formData, issue_date: e.target.value })
                  }
                  required
                  className="bg-midnight/50 border-gray-600"
                />
              </div>
              <div>
                <Label htmlFor="due_date" className="text-gray-300">
                  Due Date
                </Label>
                <Input
                  id="due_date"
                  type="date"
                  value={formData.due_date}
                  onChange={(e) =>
                    setFormData({ ...formData, due_date: e.target.value })
                  }
                  required
                  className="bg-midnight/50 border-gray-600"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Client Information */}
        <Card className="bg-midnight-light/50 border-gray-700">
          <CardHeader>
            <CardTitle className="text-white">Client Information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="client_name" className="text-gray-300">
                  Client Name *
                </Label>
                <Input
                  id="client_name"
                  value={formData.client_name}
                  onChange={(e) =>
                    setFormData({ ...formData, client_name: e.target.value })
                  }
                  required
                  className="bg-midnight/50 border-gray-600"
                />
              </div>
              <div>
                <Label htmlFor="client_company" className="text-gray-300">
                  Company
                </Label>
                <Input
                  id="client_company"
                  value={formData.client_company}
                  onChange={(e) =>
                    setFormData({ ...formData, client_company: e.target.value })
                  }
                  className="bg-midnight/50 border-gray-600"
                />
              </div>
              <div>
                <Label htmlFor="client_email" className="text-gray-300">
                  Email *
                </Label>
                <Input
                  id="client_email"
                  type="email"
                  value={formData.client_email}
                  onChange={(e) =>
                    setFormData({ ...formData, client_email: e.target.value })
                  }
                  required
                  className="bg-midnight/50 border-gray-600"
                />
              </div>
              <div>
                <Label htmlFor="client_phone" className="text-gray-300">
                  Phone
                </Label>
                <Input
                  id="client_phone"
                  value={formData.client_phone}
                  onChange={(e) =>
                    setFormData({ ...formData, client_phone: e.target.value })
                  }
                  className="bg-midnight/50 border-gray-600"
                />
              </div>
            </div>
            <div>
              <Label htmlFor="client_address" className="text-gray-300">
                Address
              </Label>
              <Textarea
                id="client_address"
                value={formData.client_address}
                onChange={(e) =>
                  setFormData({ ...formData, client_address: e.target.value })
                }
                className="bg-midnight/50 border-gray-600"
                rows={3}
              />
            </div>
          </CardContent>
        </Card>

        {/* Line Items */}
        <Card className="bg-midnight-light/50 border-gray-700">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-white">Line Items</CardTitle>
              <Button
                type="button"
                onClick={addLineItem}
                variant="outline"
                className="border-gray-600 text-gray-300 hover:bg-gray-700"
              >
                <Plus className="h-4 w-4 mr-2" />
                Add Item
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {lineItems.map((item, index) => (
              <div
                key={item.id}
                className="grid grid-cols-1 md:grid-cols-12 gap-4 p-4 bg-midnight/30 rounded-lg border border-gray-700"
              >
                <div className="md:col-span-3">
                  <Label className="text-gray-300">Service/Product</Label>
                  <Input
                    value={item.service_name}
                    onChange={(e) =>
                      updateLineItem(item.id, "service_name", e.target.value)
                    }
                    required
                    className="bg-midnight/50 border-gray-600"
                  />
                </div>
                <div className="md:col-span-3">
                  <Label className="text-gray-300">Description</Label>
                  <Input
                    value={item.description}
                    onChange={(e) =>
                      updateLineItem(item.id, "description", e.target.value)
                    }
                    className="bg-midnight/50 border-gray-600"
                  />
                </div>
                <div className="md:col-span-2">
                  <Label className="text-gray-300">Quantity</Label>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={item.quantity}
                    onChange={(e) =>
                      updateLineItem(item.id, "quantity", parseFloat(e.target.value) || 0)
                    }
                    required
                    className="bg-midnight/50 border-gray-600"
                  />
                </div>
                <div className="md:col-span-2">
                  <Label className="text-gray-300">Rate ($)</Label>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={item.rate}
                    onChange={(e) =>
                      updateLineItem(item.id, "rate", parseFloat(e.target.value) || 0)
                    }
                    required
                    className="bg-midnight/50 border-gray-600"
                  />
                </div>
                <div className="md:col-span-1">
                  <Label className="text-gray-300">Amount</Label>
                  <div className="text-white font-medium py-2">
                    ${item.amount.toFixed(2)}
                  </div>
                </div>
                <div className="md:col-span-1 flex items-end">
                  {lineItems.length > 1 && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => removeLineItem(item.id)}
                      className="border-red-600 text-red-300 hover:bg-red-900/20 w-full"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Totals */}
        <Card className="bg-midnight-light/50 border-gray-700">
          <CardHeader>
            <CardTitle className="text-white">Summary</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <Label htmlFor="tax" className="text-gray-300">
                  Tax ($)
                </Label>
                <Input
                  id="tax"
                  type="number"
                  min="0"
                  step="0.01"
                  value={formData.tax}
                  onChange={(e) =>
                    setFormData({ ...formData, tax: parseFloat(e.target.value) || 0 })
                  }
                  className="bg-midnight/50 border-gray-600"
                />
              </div>
              <div>
                <Label htmlFor="discount" className="text-gray-300">
                  Discount ($)
                </Label>
                <Input
                  id="discount"
                  type="number"
                  min="0"
                  step="0.01"
                  value={formData.discount}
                  onChange={(e) =>
                    setFormData({ ...formData, discount: parseFloat(e.target.value) || 0 })
                  }
                  className="bg-midnight/50 border-gray-600"
                />
              </div>
            </div>

            <div className="border-t border-gray-700 pt-4 space-y-2">
              <div className="flex justify-between text-gray-300">
                <span>Subtotal:</span>
                <span className="font-medium">${calculateSubtotal().toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-gray-300">
                <span>Tax:</span>
                <span className="font-medium">${Number(formData.tax).toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-gray-300">
                <span>Discount:</span>
                <span className="font-medium">-${Number(formData.discount).toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-white text-xl font-bold pt-2 border-t border-gray-700">
                <span>Total:</span>
                <span>${calculateTotal().toFixed(2)}</span>
              </div>
            </div>

            <div>
              <Label htmlFor="payment_instructions" className="text-gray-300">
                Payment Instructions
              </Label>
              <Textarea
                id="payment_instructions"
                value={formData.payment_instructions}
                onChange={(e) =>
                  setFormData({ ...formData, payment_instructions: e.target.value })
                }
                className="bg-midnight/50 border-gray-600"
                rows={3}
                placeholder="Bank details, payment terms, etc..."
              />
            </div>
          </CardContent>
        </Card>

        {/* Actions */}
        <div className="flex gap-4 justify-end">
          <Button
            type="button"
            variant="outline"
            onClick={() => navigate("/admin/invoices")}
            className="border-gray-600 text-gray-300 hover:bg-gray-700"
          >
            Cancel
          </Button>
          <Button
            type="submit"
            disabled={loading}
            className="bg-gradient-to-r from-neon-purple to-neon-blue hover:from-neon-purple/80 hover:to-neon-blue/80"
          >
            <Save className="h-4 w-4 mr-2" />
            {loading ? "Creating..." : "Create Invoice"}
          </Button>
        </div>
      </form>
    </div>
  );
}
