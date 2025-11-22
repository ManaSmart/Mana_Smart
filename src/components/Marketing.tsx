import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Megaphone,
  Plus,
  Eye,
  MousePointerClick,
  Edit,
  Trash2,
  Play,
  Pause,
  RefreshCw,
  Loader2,
  Download,
} from "lucide-react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "./ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./ui/table";
import { Badge } from "./ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "./ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { Label } from "./ui/label";
import { Skeleton } from "./ui/skeleton";
import { toast } from "sonner";
import * as XLSX from "@e965/xlsx";
import { supabase } from "../lib/supabaseClient";
import type {
  MarketingCampaigns,
  MarketingCampaignsInsert,
  MarketingCampaignsUpdate,
} from "../../supabase/models/marketing_campaigns";

interface Campaign {
  id: string;
  name: string;
  platform: string;
  status: "active" | "paused" | "completed";
  budget: number;
  spent: number;
  startDate: string;
  endDate: string;
  impressions: number;
  clicks: number;
  lastModified: string;
}

interface CampaignForm {
  name: string;
  platform: string;
  budget: string;
  startDate: string;
  endDate: string;
  impressions: string;
  clicks: string;
  spent: string;
  status: Campaign["status"];
}

const defaultCampaignForm: CampaignForm = {
  name: "",
  platform: "",
  budget: "",
  startDate: "",
  endDate: "",
  impressions: "0",
  clicks: "0",
  spent: "0",
  status: "active",
};

const mapRowToCampaign = (row: MarketingCampaigns): Campaign => {
  const performance = (row.performance ?? {}) as { impressions?: number; clicks?: number };
  return {
    id: row.campaign_id,
    name: row.campaign_name,
    platform: row.platform,
    status: (row.status ?? "active") as Campaign["status"],
    budget: Number(row.budget ?? 0),
    spent: Number(row.spent ?? 0),
    startDate: row.start_period,
    endDate: row.end_period,
    impressions: Number(performance.impressions ?? 0),
    clicks: Number(performance.clicks ?? 0),
    lastModified: row.last_modified ?? new Date().toISOString(),
  };
};

const parseNumberField = (value: string, fallback = 0) => {
  if (!value) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const formatPercent = (value: number) => `${Number.isFinite(value) ? value.toFixed(0) : 0}%`;

export function Marketing() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const [isAddOpen, setIsAddOpen] = useState(false);
  const [isAddSaving, setIsAddSaving] = useState(false);
  const [addForm, setAddForm] = useState<CampaignForm>(defaultCampaignForm);

  const [editCampaignId, setEditCampaignId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<CampaignForm>(defaultCampaignForm);
  const [isEditSaving, setIsEditSaving] = useState(false);

  const statistics = useMemo(() => {
    if (campaigns.length === 0) {
      return {
        totalBudget: 0,
        totalSpent: 0,
        totalImpressions: 0,
        totalClicks: 0,
        activeCampaigns: 0,
      };
    }

    const totals = campaigns.reduce(
      (acc, campaign) => {
        acc.totalBudget += campaign.budget;
        acc.totalSpent += campaign.spent;
        acc.totalImpressions += campaign.impressions;
        acc.totalClicks += campaign.clicks;
        if (campaign.status === "active") {
          acc.activeCampaigns += 1;
        }
        return acc;
      },
      {
        totalBudget: 0,
        totalSpent: 0,
        totalImpressions: 0,
        totalClicks: 0,
        activeCampaigns: 0,
      }
    );

    return totals;
  }, [campaigns]);

  const exportToExcel = () => {
    try {
      const exportData = campaigns.map((campaign) => ({
        "Campaign Name": campaign.name,
        "Platform": campaign.platform,
        "Budget (SAR)": campaign.budget,
        "Spent (SAR)": campaign.spent,
        "Impressions": campaign.impressions,
        "Clicks": campaign.clicks,
        "Status": campaign.status,
        "Start Date": campaign.startDate || "",
        "End Date": campaign.endDate || "",
        "Created At": campaign.lastModified || "",
      }));

      const ws = XLSX.utils.json_to_sheet(exportData);
      ws["!cols"] = [
        { wch: 25 }, { wch: 15 }, { wch: 15 }, { wch: 15 }, { wch: 15 },
        { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 12 },
      ];
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Marketing Campaigns");
      const fileName = `marketing_campaigns_${new Date().toISOString().split("T")[0]}.xlsx`;
      XLSX.writeFile(wb, fileName);
      toast.success("Excel file exported successfully");
    } catch (error) {
      toast.error("Failed to export Excel file");
      console.error(error);
    }
  };

  const fetchCampaigns = useCallback(
    async (options?: { silent?: boolean }) => {
      const silent = options?.silent ?? false;
      if (!silent) {
        setLoading(true);
      }
      setError(null);

      try {
        const { data, error: fetchError } = await supabase
          .from("marketing_campaigns")
          .select("*")
          .order("last_modified", { ascending: false });

        if (fetchError) {
          throw fetchError;
        }

        setCampaigns((data ?? []).map(mapRowToCampaign));
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to load campaigns";
        setError(message);
        toast.error(message);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    []
  );

  useEffect(() => {
    void fetchCampaigns();
  }, [fetchCampaigns]);

  const handleOpenAddDialog = () => {
    setAddForm(defaultCampaignForm);
    setIsAddOpen(true);
  };

  const handleAddCampaign = async () => {
    if (
      !addForm.name.trim() ||
      !addForm.platform.trim() ||
      !addForm.budget.trim() ||
      !addForm.startDate ||
      !addForm.endDate
    ) {
      toast.error("Please fill all required fields");
      return;
    }

    setIsAddSaving(true);

    const payload: MarketingCampaignsInsert = {
      campaign_name: addForm.name.trim(),
      platform: addForm.platform,
      status: addForm.status,
      budget: parseNumberField(addForm.budget, 0),
      spent: parseNumberField(addForm.spent, 0),
      start_period: addForm.startDate,
      end_period: addForm.endDate,
      last_modified: new Date().toISOString(),
      performance: {
        impressions: parseNumberField(addForm.impressions, 0),
        clicks: parseNumberField(addForm.clicks, 0),
      },
    };

    try {
      const { data, error: insertError } = await supabase
        .from("marketing_campaigns")
        .insert(payload)
        .select()
        .single();

      if (insertError || !data) {
        throw insertError ?? new Error("Campaign insert failed");
      }

      setCampaigns((prev) => [mapRowToCampaign(data), ...prev]);
      setIsAddOpen(false);
      setAddForm(defaultCampaignForm);
      toast.success("Campaign added successfully");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to add campaign";
      toast.error(message);
    } finally {
      setIsAddSaving(false);
    }
  };

  const openEditDialog = (campaign: Campaign) => {
    setEditCampaignId(campaign.id);
    setEditForm({
      name: campaign.name,
      platform: campaign.platform,
      budget: String(campaign.budget),
      startDate: campaign.startDate,
      endDate: campaign.endDate,
      impressions: String(campaign.impressions),
      clicks: String(campaign.clicks),
      spent: String(campaign.spent),
      status: campaign.status,
    });
  };

  const handleUpdateCampaign = async () => {
    if (!editCampaignId) return;

    if (
      !editForm.name.trim() ||
      !editForm.platform.trim() ||
      !editForm.budget.trim() ||
      !editForm.startDate ||
      !editForm.endDate
    ) {
      toast.error("Please fill all required fields");
      return;
    }

    setIsEditSaving(true);

    const payload: MarketingCampaignsUpdate = {
      campaign_id: editCampaignId,
      campaign_name: editForm.name.trim(),
      platform: editForm.platform,
      status: editForm.status,
      budget: parseNumberField(editForm.budget, 0),
      spent: parseNumberField(editForm.spent, 0),
      start_period: editForm.startDate,
      end_period: editForm.endDate,
      last_modified: new Date().toISOString(),
      performance: {
        impressions: parseNumberField(editForm.impressions, 0),
        clicks: parseNumberField(editForm.clicks, 0),
      },
    };

    try {
      const { data, error: updateError } = await supabase
        .from("marketing_campaigns")
        .update(payload)
        .eq("campaign_id", editCampaignId)
        .select()
        .single();

      if (updateError || !data) {
        throw updateError ?? new Error("Campaign update failed");
      }

      setCampaigns((prev) =>
        prev.map((campaign) =>
          campaign.id === editCampaignId ? mapRowToCampaign(data) : campaign
        )
      );
      setEditCampaignId(null);
      toast.success("Campaign updated successfully");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to update campaign";
      toast.error(message);
    } finally {
      setIsEditSaving(false);
    }
  };

  const handleDeleteCampaign = async (id: string) => {
    const campaign = campaigns.find((item) => item.id === id);
    if (!campaign) return;

    const confirmed = window.confirm(`Delete campaign "${campaign.name}"?`);
    if (!confirmed) return;

    try {
      const { error: deleteError } = await supabase
        .from("marketing_campaigns")
        .delete()
        .eq("campaign_id", id);
      if (deleteError) throw deleteError;

      setCampaigns((prev) => prev.filter((item) => item.id !== id));
      toast.success("Campaign deleted successfully");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to delete campaign";
      toast.error(message);
    }
  };

  const toggleStatus = async (id: string) => {
    const campaign = campaigns.find((item) => item.id === id);
    if (!campaign) return;

    const nextStatus: Campaign["status"] =
      campaign.status === "active" ? "paused" : "active";

    try {
      const { data, error: updateError } = await supabase
        .from("marketing_campaigns")
        .update({
          status: nextStatus,
          last_modified: new Date().toISOString(),
        })
        .eq("campaign_id", id)
        .select()
        .single();

      if (updateError || !data) {
        throw updateError ?? new Error("Unable to update status");
      }

      setCampaigns((prev) =>
        prev.map((item) => (item.id === id ? mapRowToCampaign(data) : item))
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to change status";
      toast.error(message);
    }
  };

  const getStatusBadge = (status: Campaign["status"]) => {
    const styles: Record<Campaign["status"], string> = {
      active: "bg-green-100 text-green-800",
      paused: "bg-yellow-100 text-yellow-800",
      completed: "bg-gray-100 text-gray-800",
    };
    return styles[status];
  };

  const handleRefresh = () => {
    setRefreshing(true);
    void fetchCampaigns({ silent: true });
  };

  const renderTableContent = () => {
    if (loading) {
      return (
        <TableRow>
          <TableCell colSpan={9}>
            <div className="py-6 space-y-3">
              <Skeleton className="h-4 w-2/3" />
              <Skeleton className="h-4 w-1/2" />
              <Skeleton className="h-4 w-3/4" />
            </div>
          </TableCell>
        </TableRow>
      );
    }

    if (error) {
      return (
        <TableRow>
          <TableCell colSpan={9} className="text-center text-destructive">
            {error}
          </TableCell>
        </TableRow>
      );
    }

    if (campaigns.length === 0) {
      return (
        <TableRow>
          <TableCell colSpan={9} className="text-center text-muted-foreground">
            No campaigns found. Use "New Campaign" to add one.
          </TableCell>
        </TableRow>
      );
    }

    return campaigns.map((campaign) => (
      <TableRow key={campaign.id}>
        <TableCell>
          <div className="font-medium">{campaign.name}</div>
        </TableCell>
        <TableCell>{campaign.platform}</TableCell>
        <TableCell>SAR {campaign.budget.toLocaleString()}</TableCell>
        <TableCell>
          <div>
            <div>SAR {campaign.spent.toLocaleString()}</div>
            <div className="text-xs text-muted-foreground">
              {campaign.budget > 0
                ? formatPercent((campaign.spent / campaign.budget) * 100)
                : "0%"}
            </div>
          </div>
        </TableCell>
        <TableCell>
          <div className="text-sm">
            <div>{new Date(campaign.startDate).toLocaleDateString("en-GB")}</div>
            <div className="text-muted-foreground">
              {new Date(campaign.endDate).toLocaleDateString("en-GB")}
            </div>
          </div>
        </TableCell>
        <TableCell>
          <div className="space-y-1 text-sm">
            <div className="flex items-center gap-1">
              <Eye className="w-3 h-3 text-muted-foreground" />
              {(campaign.impressions / 1000).toFixed(0)}K
            </div>
            <div className="flex items-center gap-1">
              <MousePointerClick className="w-3 h-3 text-muted-foreground" />
              {campaign.clicks.toLocaleString()}
            </div>
          </div>
        </TableCell>
        <TableCell>
          <Badge className={getStatusBadge(campaign.status)}>{campaign.status}</Badge>
        </TableCell>
        <TableCell>
          <div className="text-sm text-muted-foreground">
            {new Date(campaign.lastModified).toLocaleDateString("en-GB")}
          </div>
        </TableCell>
        <TableCell className="text-right">
          <div className="flex justify-end gap-1">
            {campaign.status !== "completed" && (
              <Button
                variant="ghost"
                size="icon"
                onClick={() => toggleStatus(campaign.id)}
              >
                {campaign.status === "active" ? (
                  <Pause className="w-4 h-4" />
                ) : (
                  <Play className="w-4 h-4" />
                )}
              </Button>
            )}
            <Button
              variant="ghost"
              size="icon"
              onClick={() => openEditDialog(campaign)}
            >
              <Edit className="w-4 h-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => handleDeleteCampaign(campaign.id)}
            >
              <Trash2 className="w-4 h-4 text-red-500" />
            </Button>
          </div>
        </TableCell>
      </TableRow>
    ));
  };

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-blue-100 rounded-lg">
            <Megaphone className="w-6 h-6 text-blue-600" />
          </div>
          <div>
            <h1 className="text-2xl">Marketing Campaigns</h1>
            <p className="text-sm text-muted-foreground">Manage your marketing campaigns</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="icon"
            onClick={handleRefresh}
            disabled={refreshing || loading}
            title="Refresh campaigns"
          >
            {refreshing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          </Button>
          <Button onClick={exportToExcel} variant="outline" className="gap-2">
            <Download className="h-4 w-4" />
            Export Excel
          </Button>
          <Button
            onClick={handleOpenAddDialog}
            className="bg-purple-600 hover:bg-purple-700 text-white"
          >
            <Plus className="w-4 h-4 mr-2" />
            New Campaign
          </Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-5">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Active Campaigns</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl">{statistics.activeCampaigns}</div>
            <p className="text-xs text-muted-foreground">Currently running</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Total Budget</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl">SAR {statistics.totalBudget.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">Allocated budget</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Total Spent</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl">SAR {statistics.totalSpent.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">
              {statistics.totalBudget > 0
                ? `${((statistics.totalSpent / statistics.totalBudget) * 100).toFixed(0)}% utilized`
                : "0% utilized"}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Impressions</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl">
              {(statistics.totalImpressions / 1_000_000).toFixed(1)}M
            </div>
            <p className="text-xs text-muted-foreground">Total views</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Clicks</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl">{(statistics.totalClicks / 1000).toFixed(1)}K</div>
            <p className="text-xs text-muted-foreground">
              {statistics.totalImpressions > 0
                ? `${((statistics.totalClicks / statistics.totalImpressions) * 100).toFixed(2)}% CTR`
                : "0% CTR"}
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>All Campaigns</CardTitle>
          <CardDescription>View and manage your marketing campaigns</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Campaign</TableHead>
                  <TableHead>Platform</TableHead>
                  <TableHead>Budget</TableHead>
                  <TableHead>Spent</TableHead>
                  <TableHead>Period</TableHead>
                  <TableHead>Performance</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Last Modified</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>{renderTableContent()}</TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Dialog
        open={isAddOpen}
        onOpenChange={(open) => {
          setIsAddOpen(open);
          if (!open) {
            setAddForm(defaultCampaignForm);
          }
        }}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>New Campaign</DialogTitle>
            <DialogDescription>Create a new marketing campaign</DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Campaign Name *</Label>
              <Input
                id="name"
                value={addForm.name}
                onChange={(e) => setAddForm((prev) => ({ ...prev, name: e.target.value }))}
                placeholder="e.g., Ramadan Collection 2025"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="platform">Platform *</Label>
              <Select
                value={addForm.platform}
                onValueChange={(value) => setAddForm((prev) => ({ ...prev, platform: value }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select platform" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Instagram">Instagram</SelectItem>
                  <SelectItem value="Facebook">Facebook</SelectItem>
                  <SelectItem value="Google Search">Google Search</SelectItem>
                  <SelectItem value="TikTok">TikTok</SelectItem>
                  <SelectItem value="Snapchat">Snapchat</SelectItem>
                  <SelectItem value="Twitter">Twitter</SelectItem>
                  <SelectItem value="YouTube">YouTube</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="budget">Budget (SAR) *</Label>
              <Input
                id="budget"
                type="number"
                value={addForm.budget}
                onChange={(e) => setAddForm((prev) => ({ ...prev, budget: e.target.value }))}
                placeholder="25000"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="startDate">Start Date *</Label>
                <Input
                  id="startDate"
                  type="date"
                  value={addForm.startDate}
                  onChange={(e) => setAddForm((prev) => ({ ...prev, startDate: e.target.value }))}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="endDate">End Date *</Label>
                <Input
                  id="endDate"
                  type="date"
                  value={addForm.endDate}
                  onChange={(e) => setAddForm((prev) => ({ ...prev, endDate: e.target.value }))}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="impressions">Starting Impressions</Label>
                <Input
                  id="impressions"
                  type="number"
                  min="0"
                  value={addForm.impressions}
                  onChange={(e) => setAddForm((prev) => ({ ...prev, impressions: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="clicks">Starting Clicks</Label>
                <Input
                  id="clicks"
                  type="number"
                  min="0"
                  value={addForm.clicks}
                  onChange={(e) => setAddForm((prev) => ({ ...prev, clicks: e.target.value }))}
                />
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsAddOpen(false)} disabled={isAddSaving}>
              Cancel
            </Button>
            <Button
              onClick={handleAddCampaign}
              className="bg-purple-600 hover:bg-purple-700 text-white"
              disabled={isAddSaving}
            >
              {isAddSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Create Campaign"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={editCampaignId !== null}
        onOpenChange={(open) => {
          if (!open) {
            setEditCampaignId(null);
          }
        }}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit Campaign</DialogTitle>
            <DialogDescription>Update campaign details</DialogDescription>
          </DialogHeader>

          {editCampaignId && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="editName">Campaign Name</Label>
                <Input
                  id="editName"
                  value={editForm.name}
                  onChange={(e) => setEditForm((prev) => ({ ...prev, name: e.target.value }))}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="editPlatform">Platform</Label>
                <Select
                  value={editForm.platform}
                  onValueChange={(value) => setEditForm((prev) => ({ ...prev, platform: value }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Instagram">Instagram</SelectItem>
                    <SelectItem value="Facebook">Facebook</SelectItem>
                    <SelectItem value="Google Search">Google Search</SelectItem>
                    <SelectItem value="TikTok">TikTok</SelectItem>
                    <SelectItem value="Snapchat">Snapchat</SelectItem>
                    <SelectItem value="Twitter">Twitter</SelectItem>
                    <SelectItem value="YouTube">YouTube</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="editBudget">Budget (SAR)</Label>
                  <Input
                    id="editBudget"
                    type="number"
                    value={editForm.budget}
                    onChange={(e) => setEditForm((prev) => ({ ...prev, budget: e.target.value }))}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="editSpent">Spent (SAR)</Label>
                  <Input
                    id="editSpent"
                    type="number"
                    value={editForm.spent}
                    onChange={(e) => setEditForm((prev) => ({ ...prev, spent: e.target.value }))}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="editStartDate">Start Date</Label>
                  <Input
                    id="editStartDate"
                    type="date"
                    value={editForm.startDate}
                    onChange={(e) => setEditForm((prev) => ({ ...prev, startDate: e.target.value }))}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="editEndDate">End Date</Label>
                  <Input
                    id="editEndDate"
                    type="date"
                    value={editForm.endDate}
                    onChange={(e) => setEditForm((prev) => ({ ...prev, endDate: e.target.value }))}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="editImpressions">Impressions</Label>
                  <Input
                    id="editImpressions"
                    type="number"
                    value={editForm.impressions}
                    onChange={(e) => setEditForm((prev) => ({ ...prev, impressions: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="editClicks">Clicks</Label>
                  <Input
                    id="editClicks"
                    type="number"
                    value={editForm.clicks}
                    onChange={(e) => setEditForm((prev) => ({ ...prev, clicks: e.target.value }))}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="editStatus">Status</Label>
                <Select
                  value={editForm.status}
                  onValueChange={(value) =>
                    setEditForm((prev) => ({ ...prev, status: value as Campaign["status"] }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="paused">Paused</SelectItem>
                    <SelectItem value="completed">Completed</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setEditCampaignId(null)} disabled={isEditSaving}>
              Cancel
            </Button>
            <Button onClick={handleUpdateCampaign} disabled={isEditSaving}>
              {isEditSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
