import { useCallback, useEffect, useMemo, useState } from "react";
import { Plus, Search, Copy, Edit, Trash2, MessageSquare, Mail, Check } from "lucide-react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "./ui/dialog";
import { Label } from "./ui/label";
import { Badge } from "./ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { Textarea } from "./ui/textarea";
import { toast } from "sonner";
import { supabase } from "../lib/supabaseClient";
import type { MessageTemplateRow, MessageTemplateInsert, MessageTemplateUpdate, MessageTemplateType, MessageTemplateCategory } from "../../supabase/models/message_templates";
import { mockMessageTemplates, type MessageTemplateSeed } from "../data/mockMessageTemplates";

interface Template {
  id: string;
  name: string;
  type: MessageTemplateType;
  category: MessageTemplateCategory;
  subject?: string | null;
  content: string;
  variables: string[];
  createdAt?: string;
  updatedAt?: string;
}

const convertSeedToTemplate = (seed: MessageTemplateSeed): Template => ({
  id: seed.id,
  name: seed.name,
  type: seed.type,
  category: seed.category,
  subject: seed.subject ?? null,
  content: seed.content,
  variables: seed.variables,
});

const mockTemplates: Template[] = mockMessageTemplates.map(convertSeedToTemplate);

const extractVariables = (content: string): string[] => {
  const variablePattern = /\{\{(\w+)\}\}/g;
  const matches = content.matchAll(variablePattern);
  const variables = Array.from(matches, (match) => match[1] ?? "");
  return Array.from(new Set(variables));
};

const ensureVariables = (content: string, variables?: string[] | null) => {
  if (variables && variables.length > 0) {
    return variables;
  }
  return extractVariables(content);
};

const TEMPLATE_TABLE = "message_templates";

const mapRowToTemplate = (row: MessageTemplateRow): Template => ({
  id: row.template_id,
  name: row.name,
  type: row.template_type,
  category: row.category,
  subject: row.subject ?? null,
  content: row.content,
  variables: ensureVariables(row.content, row.variables),
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const categoryLabels = {
  "payment-reminder": "Payment Reminder",
  "invoice": "Invoice",
  "contract": "Contract",
  "welcome": "Welcome",
  "follow-up": "Follow-up",
  "visit-reminder": "Visit Reminder",
};

const categoryColors = {
  "payment-reminder": "bg-green-100 text-green-700 border-green-200",
  "invoice": "bg-blue-100 text-blue-700 border-blue-200",
  "contract": "bg-purple-100 text-purple-700 border-purple-200",
  "welcome": "bg-pink-100 text-pink-700 border-pink-200",
  "follow-up": "bg-orange-100 text-orange-700 border-orange-200",
  "visit-reminder": "bg-cyan-100 text-cyan-700 border-cyan-200",
};

export function Templates() {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedType, setSelectedType] = useState<string>("all");
  const [isAddTemplateOpen, setIsAddTemplateOpen] = useState(false);
  const [isEditTemplateOpen, setIsEditTemplateOpen] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<Template | null>(null);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Form states
  const [formName, setFormName] = useState("");
  const [formType, setFormType] = useState<MessageTemplateType>("whatsapp");
  const [formCategory, setFormCategory] = useState<MessageTemplateCategory>("payment-reminder");
  const [formSubject, setFormSubject] = useState("");
  const [formContent, setFormContent] = useState("");

  const seedMockTemplates = useCallback(async (): Promise<Template[]> => {
    try {
      const payload: MessageTemplateInsert[] = mockTemplates.map((template) => ({
        name: template.name,
        template_type: template.type,
        category: template.category,
        subject: template.subject ?? null,
        content: template.content,
        variables: template.variables.length ? template.variables : null,
      }));

      const { data, error } = await supabase
        .from(TEMPLATE_TABLE)
        .insert(payload)
        .select();

      if (error) {
        throw error;
      }

      const seeded = (data ?? []).map(mapRowToTemplate);
      toast.success("Default message templates imported");
      window.dispatchEvent(new CustomEvent("messageTemplatesUpdated"));
      return seeded;
    } catch (err) {
      console.error("Failed to seed templates", err);
      throw err;
    }
  }, []);

  const fetchTemplates = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error } = await supabase
        .from(TEMPLATE_TABLE)
        .select("*")
        .order("created_at", { ascending: false });

      if (error) {
        throw error;
      }

      const records = data ?? [];
      if (records.length === 0) {
        const seeded = await seedMockTemplates();
        setTemplates(seeded);
      } else {
        setTemplates(records.map(mapRowToTemplate));
      }
    } catch (err) {
      console.error("Failed to load templates", err);
      const message = err instanceof Error ? err.message : "Failed to load templates";
      setError(message);
      setTemplates(mockTemplates);
    } finally {
      setLoading(false);
    }
  }, [seedMockTemplates]);

  useEffect(() => {
    void fetchTemplates();
  }, [fetchTemplates]);

  const filteredTemplates = useMemo(() => {
    return templates.filter((template) => {
      const matchesSearch =
        template.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        template.content.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesType = selectedType === "all" || template.type === selectedType;
      return matchesSearch && matchesType;
    });
  }, [templates, searchQuery, selectedType]);

  const resetForm = () => {
    setFormName("");
    setFormType("whatsapp");
    setFormCategory("payment-reminder");
    setFormSubject("");
    setFormContent("");
  };

  const extractVariables = (content: string): string[] => {
    const regex = /\{\{([^}]+)\}\}/g;
    const matches = content.match(regex);
    if (!matches) return [];
    return [...new Set(matches.map(m => m.replace(/\{\{|\}\}/g, '')))];
  };

  const handleAddTemplate = async () => {
    if (!formName.trim()) {
      toast.error("Please enter template name");
      return;
    }
    if (!formContent.trim()) {
      toast.error("Please enter template content");
      return;
    }

    setIsSaving(true);

    const variables = extractVariables(formContent);
    const payload: MessageTemplateInsert = {
      name: formName.trim(),
      template_type: formType,
      category: formCategory,
      subject: formSubject.trim() ? formSubject.trim() : null,
      content: formContent,
      variables: variables.length ? variables : null,
    };

    try {
      const { data, error } = await supabase
        .from(TEMPLATE_TABLE)
        .insert(payload)
        .select()
        .single();

      if (error || !data) {
        throw error ?? new Error("No data returned after inserting template");
      }

      const created = mapRowToTemplate(data as MessageTemplateRow);
      setTemplates((prev) => [created, ...prev]);
      setIsAddTemplateOpen(false);
      resetForm();
      toast.success("Template created successfully!");
      window.dispatchEvent(new CustomEvent("messageTemplatesUpdated"));
    } catch (err) {
      console.error("Failed to create template", err);
      const message = err instanceof Error ? err.message : "Failed to create template";
      toast.error(message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleEditTemplate = async () => {
    if (!selectedTemplate) return;
    
    if (!formName.trim()) {
      toast.error("Please enter template name");
      return;
    }
    if (!formContent.trim()) {
      toast.error("Please enter template content");
      return;
    }

    setIsSaving(true);

    const variables = extractVariables(formContent);
    const payload: MessageTemplateUpdate = {
      template_id: selectedTemplate.id,
      name: formName.trim(),
      template_type: formType,
      category: formCategory,
      subject: formSubject.trim() ? formSubject.trim() : null,
      content: formContent,
      variables: variables.length ? variables : null,
    };

    try {
      const { data, error } = await supabase
        .from(TEMPLATE_TABLE)
        .update(payload)
        .eq("template_id", selectedTemplate.id)
        .select()
        .single();

      if (error || !data) {
        throw error ?? new Error("No data returned after updating template");
      }

      const updated = mapRowToTemplate(data as MessageTemplateRow);
      setTemplates((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
      setIsEditTemplateOpen(false);
      setSelectedTemplate(null);
      resetForm();
      toast.success("Template updated successfully!");
      window.dispatchEvent(new CustomEvent("messageTemplatesUpdated"));
    } catch (err) {
      console.error("Failed to update template", err);
      const message = err instanceof Error ? err.message : "Failed to update template";
      toast.error(message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteTemplate = async (id: string) => {
    const template = templates.find((t) => t.id === id);
    if (!template) return;

    const confirmDelete = window.confirm(`Delete template "${template.name}"?`);
    if (!confirmDelete) {
      return;
    }

    setDeletingId(id);
    try {
      const { error } = await supabase.from(TEMPLATE_TABLE).delete().eq("template_id", id);
      if (error) {
        throw error;
      }

      setTemplates((prev) => prev.filter((t) => t.id !== id));
      toast.success("Template deleted successfully!");
      window.dispatchEvent(new CustomEvent("messageTemplatesUpdated"));
    } catch (err) {
      console.error("Failed to delete template", err);
      const message = err instanceof Error ? err.message : "Failed to delete template";
      toast.error(message);
    } finally {
      setDeletingId(null);
    }
  };

  const openEditDialog = (template: Template) => {
    setSelectedTemplate(template);
    setFormName(template.name);
    setFormType(template.type);
    setFormCategory(template.category);
    setFormSubject(template.subject || "");
    setFormContent(template.content);
    setIsEditTemplateOpen(true);
  };

  const copyToClipboard = (content: string) => {
    // Try modern clipboard API first
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(content)
        .then(() => {
          toast.success("Template copied to clipboard!");
        })
        .catch(() => {
          // Fallback method
          fallbackCopyToClipboard(content);
        });
    } else {
      // Fallback method for browsers that don't support clipboard API
      fallbackCopyToClipboard(content);
    }
  };

  const fallbackCopyToClipboard = (content: string) => {
    const textArea = document.createElement("textarea");
    textArea.value = content;
    textArea.style.position = "fixed";
    textArea.style.left = "-999999px";
    textArea.style.top = "-999999px";
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    
    try {
      document.execCommand('copy');
      toast.success("Template copied to clipboard!");
    } catch (err) {
      toast.error("Failed to copy. Please copy manually.");
    } finally {
      document.body.removeChild(textArea);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">Message Templates</h2>
          <p className="text-muted-foreground mt-1">Pre-built templates for quick customer communication</p>
        </div>
        <Dialog open={isAddTemplateOpen} onOpenChange={(open) => {
          setIsAddTemplateOpen(open);
          if (!open) resetForm();
        }}>
          <DialogTrigger asChild>
            <Button className="gap-2 bg-purple-600 hover:bg-purple-700 text-white" disabled={isSaving}>
              <Plus className="h-4 w-4" />
              Create Template
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Create New Template</DialogTitle>
              <DialogDescription>Create a reusable message template</DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="template-name">Template Name *</Label>
                  <Input 
                    id="template-name" 
                    placeholder="e.g., Payment Reminder"
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="template-type">Type *</Label>
                  <Select
                    value={formType}
                    onValueChange={(value) => setFormType(value as MessageTemplateType)}
                    disabled={isSaving}
                  >
                    <SelectTrigger id="template-type">
                      <SelectValue placeholder="Select type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="whatsapp">WhatsApp</SelectItem>
                      <SelectItem value="email">Email</SelectItem>
                      <SelectItem value="sms">SMS</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="template-category">Category *</Label>
                <Select
                  value={formCategory}
                  onValueChange={(value) => setFormCategory(value as MessageTemplateCategory)}
                  disabled={isSaving}
                >
                  <SelectTrigger id="template-category">
                    <SelectValue placeholder="Select category" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="payment-reminder">Payment Reminder</SelectItem>
                    <SelectItem value="invoice">Invoice</SelectItem>
                    <SelectItem value="contract">Contract</SelectItem>
                    <SelectItem value="welcome">Welcome</SelectItem>
                    <SelectItem value="follow-up">Follow-up</SelectItem>
                    <SelectItem value="visit-reminder">Visit Reminder</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="template-subject">Subject (for Email)</Label>
                <Input 
                  id="template-subject" 
                  placeholder="Email subject line"
                  value={formSubject}
                  onChange={(e) => setFormSubject(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="template-content">Message Content *</Label>
                <Textarea 
                  id="template-content" 
                  placeholder="Use {{variable_name}} for dynamic content"
                  rows={10}
                  value={formContent}
                  onChange={(e) => setFormContent(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label>Available Variables</Label>
                <div className="flex flex-wrap gap-2">
                  {["customer_name", "invoice_number", "amount", "due_date", "mobile", "location", "contract_number"].map((variable) => (
                    <Badge 
                      key={variable} 
                      variant="outline" 
                      className="font-mono text-xs cursor-pointer hover:bg-muted"
                      onClick={() => {
                        setFormContent(formContent + `{{${variable}}}`);
                      }}
                    >
                      {`{{${variable}}}`}
                    </Badge>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">Click on a variable to insert it into the content</p>
              </div>
            </div>
            <div className="flex justify-end gap-3">
              <Button variant="outline" onClick={() => {
                setIsAddTemplateOpen(false);
                resetForm();
              }} disabled={isSaving}>
                Cancel
              </Button>
              <Button
                onClick={() => {
                  void handleAddTemplate();
                }}
                className="bg-purple-600 hover:bg-purple-700 text-white"
                disabled={isSaving}
              >
                Create Template
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Edit Template Dialog */}
      <Dialog open={isEditTemplateOpen} onOpenChange={(open) => {
        setIsEditTemplateOpen(open);
        if (!open) {
          setSelectedTemplate(null);
          resetForm();
        }
      }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Edit Template</DialogTitle>
            <DialogDescription>Update your message template</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="edit-template-name">Template Name *</Label>
                <Input 
                  id="edit-template-name" 
                  placeholder="e.g., Payment Reminder"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  disabled={isSaving}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-template-type">Type *</Label>
                <Select
                  value={formType}
                  onValueChange={(value) => setFormType(value as MessageTemplateType)}
                  disabled={isSaving}
                >
                  <SelectTrigger id="edit-template-type">
                    <SelectValue placeholder="Select type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="whatsapp">WhatsApp</SelectItem>
                    <SelectItem value="email">Email</SelectItem>
                    <SelectItem value="sms">SMS</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-template-category">Category *</Label>
              <Select
                value={formCategory}
                onValueChange={(value) => setFormCategory(value as MessageTemplateCategory)}
                disabled={isSaving}
              >
                <SelectTrigger id="edit-template-category">
                  <SelectValue placeholder="Select category" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="payment-reminder">Payment Reminder</SelectItem>
                  <SelectItem value="invoice">Invoice</SelectItem>
                  <SelectItem value="contract">Contract</SelectItem>
                  <SelectItem value="welcome">Welcome</SelectItem>
                  <SelectItem value="follow-up">Follow-up</SelectItem>
                  <SelectItem value="visit-reminder">Visit Reminder</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-template-subject">Subject (for Email)</Label>
              <Input 
                id="edit-template-subject" 
                placeholder="Email subject line"
                value={formSubject}
                onChange={(e) => setFormSubject(e.target.value)}
                disabled={isSaving}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-template-content">Message Content *</Label>
              <Textarea 
                id="edit-template-content" 
                placeholder="Use {{variable_name}} for dynamic content"
                rows={10}
                value={formContent}
                onChange={(e) => setFormContent(e.target.value)}
                disabled={isSaving}
              />
            </div>

            <div className="space-y-2">
              <Label>Available Variables</Label>
              <div className="flex flex-wrap gap-2">
                {["customer_name", "invoice_number", "amount", "due_date", "mobile", "location", "contract_number"].map((variable) => (
                  <Badge 
                    key={variable} 
                    variant="outline" 
                    className="font-mono text-xs cursor-pointer hover:bg-muted"
                    onClick={() => {
                      setFormContent(formContent + `{{${variable}}}`);
                    }}
                  >
                    {`{{${variable}}}`}
                  </Badge>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">Click on a variable to insert it into the content</p>
            </div>
          </div>
          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={() => {
              setIsEditTemplateOpen(false);
              setSelectedTemplate(null);
              resetForm();
            }} disabled={isSaving}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                void handleEditTemplate();
              }}
              disabled={isSaving}
            >
              Update Template
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Filters */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search templates..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select value={selectedType} onValueChange={setSelectedType}>
              <SelectTrigger className="w-[200px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                <SelectItem value="whatsapp">WhatsApp</SelectItem>
                <SelectItem value="email">Email</SelectItem>
                <SelectItem value="sms">SMS</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
      </Card>

      {error && (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {/* Templates Grid */}
      {loading ? (
        <Card>
          <CardContent className="py-12">
            <div className="text-center text-muted-foreground">Loading templates...</div>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {filteredTemplates.map((template) => {
              const TypeIcon = template.type === "whatsapp" ? MessageSquare : 
                              template.type === "email" ? Mail : MessageSquare;
              
              return (
                <Card key={template.id} className="hover:shadow-md transition-shadow">
                  <CardHeader>
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-2">
                        <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                          <TypeIcon className="h-5 w-5 text-primary" />
                        </div>
                        <div>
                          <CardTitle className="text-base">{template.name}</CardTitle>
                          <div className="flex items-center gap-2 mt-1">
                            <Badge variant="outline" className="text-xs capitalize">
                              {template.type}
                            </Badge>
                            <Badge className={`text-xs ${categoryColors[template.category]}`}>
                              {categoryLabels[template.category]}
                            </Badge>
                          </div>
                        </div>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {template.subject && (
                      <div>
                        <div className="text-xs font-medium text-muted-foreground mb-1">Subject:</div>
                        <div className="text-sm font-medium">{template.subject}</div>
                      </div>
                    )}
                    <div>
                      <div className="text-xs font-medium text-muted-foreground mb-1">Content Preview:</div>
                      <div className="text-sm text-muted-foreground line-clamp-4 whitespace-pre-wrap bg-muted/50 p-3 rounded-lg">
                        {template.content}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs font-medium text-muted-foreground mb-2">Variables:</div>
                      <div className="flex flex-wrap gap-1">
                        {template.variables.map((variable) => (
                          <Badge key={variable} variant="secondary" className="text-xs font-mono">
                            {`{{${variable}}}`}
                          </Badge>
                        ))}
                      </div>
                    </div>
                    <div className="flex gap-2 pt-2">
                      <Button 
                        size="sm" 
                        variant="outline" 
                        className="flex-1 gap-1.5"
                        onClick={() => copyToClipboard(template.content)}
                      >
                        <Copy className="h-3.5 w-3.5" />
                        Copy
                      </Button>
                      <Button 
                        size="sm" 
                        variant="outline"
                        onClick={() => openEditDialog(template)}
                      >
                        <Edit className="h-3.5 w-3.5" />
                      </Button>
                      <Button 
                        size="sm" 
                        variant="outline"
                        className="text-destructive hover:bg-destructive/10 disabled:opacity-60"
                        onClick={() => {
                          void handleDeleteTemplate(template.id);
                        }}
                        disabled={deletingId === template.id}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          {filteredTemplates.length === 0 && (
            <Card>
              <CardContent className="py-12">
                <div className="text-center text-muted-foreground">
                  {searchQuery ? "No templates found matching your search" : "No templates available. Create your first template to get started!"}
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}

      {/* Quick Tips */}
      <Card className="border-l-4 border-l-blue-600">
        <CardHeader>
          <CardTitle className="text-lg">Quick Tips</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2 text-sm text-muted-foreground">
            <div className="flex items-start gap-2">
              <Check className="h-4 w-4 text-green-600 mt-0.5" />
              <span>Use <code className="bg-muted px-1.5 py-0.5 rounded text-xs">{`{{variable_name}}`}</code> to insert dynamic content</span>
            </div>
            <div className="flex items-start gap-2">
              <Check className="h-4 w-4 text-green-600 mt-0.5" />
              <span>Keep messages personal and friendly for better engagement</span>
            </div>
            <div className="flex items-start gap-2">
              <Check className="h-4 w-4 text-green-600 mt-0.5" />
              <span>Test templates before sending to customers</span>
            </div>
            <div className="flex items-start gap-2">
              <Check className="h-4 w-4 text-green-600 mt-0.5" />
              <span>Click on variables to insert them directly into your content</span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
