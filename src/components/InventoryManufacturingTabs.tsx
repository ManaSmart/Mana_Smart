import { useState, useEffect } from "react";
import { Package, Building2, Factory, RefreshCcw } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./ui/tabs";
import { Inventory } from "./Inventory";
import { Suppliers } from "./Suppliers";
import { Manufacturing } from "./Manufacturing";
import { Returns } from "./Returns";

interface InventoryManufacturingTabsProps {
  initialTab?: "inventory" | "suppliers" | "manufacturing" | "returns";
  onTabChange?: (tab: string) => void;
}

export function InventoryManufacturingTabs({ 
  initialTab = "inventory",
  onTabChange 
}: InventoryManufacturingTabsProps) {
  const [activeTab, setActiveTab] = useState<string>(initialTab);

  useEffect(() => {
    if (initialTab) {
      setActiveTab(initialTab);
    }
  }, [initialTab]);

  const handleTabChange = (value: string) => {
    setActiveTab(value);
    if (onTabChange) {
      onTabChange(value);
    }
  };

  return (
    <div className="space-y-6">
      <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full">
        <TabsList className="grid w-full grid-cols-4 mb-4">
          <TabsTrigger value="inventory">
            <Package className="h-4 w-4 mr-2" />
            Inventory
          </TabsTrigger>
          <TabsTrigger value="suppliers">
            <Building2 className="h-4 w-4 mr-2" />
            Suppliers
          </TabsTrigger>
          <TabsTrigger value="manufacturing">
            <Factory className="h-4 w-4 mr-2" />
            Manufacturing
          </TabsTrigger>
          <TabsTrigger value="returns">
            <RefreshCcw className="h-4 w-4 mr-2" />
            Returns
          </TabsTrigger>
        </TabsList>

      <TabsContent value="inventory" className="space-y-4">
        <Inventory />
      </TabsContent>

      <TabsContent value="suppliers" className="space-y-4">
        <Suppliers />
      </TabsContent>

      <TabsContent value="manufacturing" className="space-y-4">
        <Manufacturing />
      </TabsContent>

      <TabsContent value="returns" className="space-y-4">
        <Returns />
      </TabsContent>
      </Tabs>
    </div>
  );
}