import { useState } from "react";
import { Search, Plus, X } from "lucide-react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "./ui/dialog";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "./ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";
import { toast } from "sonner";

export interface Supplier {
  id: number;
  name: string;
  mobile?: string;
  email?: string;
  location?: string;
  dbId?: string;
  creditBalance?: number;
  payableBalance?: number;
  currentBalance?: number;
  persistedBalance?: number;
}

interface SupplierSelectorProps {
  suppliers: Supplier[];
  selectedSupplierId?: number;
  onSupplierSelect: (supplier: Supplier) => void;
  onSupplierAdd?: (supplier: Supplier) => void;
  label?: string;
  placeholder?: string;
  required?: boolean;
}

export function SupplierSelector({
  suppliers,
  selectedSupplierId,
  onSupplierSelect,
  onSupplierAdd,
  label = "Supplier",
  placeholder = "Search supplier...",
  required = false
}: SupplierSelectorProps) {
  const [open, setOpen] = useState(false);
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);

  // Quick Add Supplier Form States
  const [newSupplierName, setNewSupplierName] = useState("");
  const [newSupplierMobile, setNewSupplierMobile] = useState("");
  const [newSupplierEmail, setNewSupplierEmail] = useState("");
  const [newSupplierLocation, setNewSupplierLocation] = useState("");

  const selectedSupplier = suppliers.find(s => s.id === selectedSupplierId);

  const handleAddNewSupplier = () => {
    if (!newSupplierName.trim()) {
      toast.error("Please enter supplier name");
      return;
    }

    const newSupplier: Supplier = {
      id: Date.now(),
      name: newSupplierName.trim(),
      mobile: newSupplierMobile.trim() || undefined,
      email: newSupplierEmail.trim() || undefined,
      location: newSupplierLocation.trim() || undefined,
    };

    onSupplierAdd?.(newSupplier);
    onSupplierSelect(newSupplier);

    // Reset form
    setNewSupplierName("");
    setNewSupplierMobile("");
    setNewSupplierEmail("");
    setNewSupplierLocation("");
    setIsAddDialogOpen(false);
  };

  return (
    <div className="space-y-2">
      <Label>
        {label} {required && <span className="text-destructive">*</span>}
      </Label>

      <div className="flex gap-2">
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              role="combobox"
              aria-expanded={open}
              className="w-[50%] justify-between"
            >
              {selectedSupplier ? (
                <div className="flex flex-col items-start overflow-hidden">
                  <span className="font-medium truncate max-w-full">{selectedSupplier.name}</span>
                  {selectedSupplier.mobile && (
                    <span className="text-xs text-muted-foreground truncate max-w-full">{selectedSupplier.mobile}</span>
                  )}
                </div>
              ) : (
                <span className="text-muted-foreground truncate">{placeholder}</span>
              )}
              <Search className="ml-2 h-4 w-4 shrink-0 opacity-50" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[350px] p-0" align="start">
            <Command>
              <CommandInput placeholder="Search by name or mobile..." />
              <CommandList>
                <CommandEmpty>No supplier found.</CommandEmpty>
                <CommandGroup>
                  {suppliers.map((supplier) => (
                    <CommandItem
                      key={supplier.id}
                      value={`${supplier.name} ${supplier.mobile ?? ""}`}
                      onSelect={() => {
                        onSupplierSelect(supplier);
                        setOpen(false);
                      }}
                    >
                      <div className="flex flex-col">
                        <span className="font-medium">{supplier.name}</span>
                        {supplier.mobile && (
                          <div className="flex gap-2 text-xs text-muted-foreground">
                            <span>{supplier.mobile}</span>
                          </div>
                        )}
                      </div>
                    </CommandItem>
                  ))}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>

        {selectedSupplier && (
          <Button
            variant="outline"
            size="icon"
            onClick={() => onSupplierSelect({} as Supplier)}
            title="Clear selection"
            className="shrink-0"
          >
            <X className="h-4 w-4" />
          </Button>
        )}

        <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
          <DialogTrigger asChild>
            <Button 
              variant="default" 
              size="icon" 
              title="Add new supplier"
              className="shrink-0 bg-green-600 hover:bg-green-700"
            >
              <Plus className="h-4 w-4" />
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Add New Supplier</DialogTitle>
              <DialogDescription>
                Quickly add a new supplier without leaving this page
              </DialogDescription>
            </DialogHeader>

            <div className="grid grid-cols-2 gap-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="newSupplierName">
                  Supplier Name <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="newSupplierName"
                  value={newSupplierName}
                  onChange={(e) => setNewSupplierName(e.target.value)}
                  placeholder="Aroma Scents International"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="newSupplierMobile">Mobile</Label>
                <Input
                  id="newSupplierMobile"
                  value={newSupplierMobile}
                  onChange={(e) => setNewSupplierMobile(e.target.value)}
                  placeholder="0501234567"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="newSupplierEmail">Email</Label>
                <Input
                  id="newSupplierEmail"
                  type="email"
                  value={newSupplierEmail}
                  onChange={(e) => setNewSupplierEmail(e.target.value)}
                  placeholder="supplier@example.com"
                />
              </div>

              <div className="col-span-2 space-y-2">
                <Label htmlFor="newSupplierLocation">Location</Label>
                <Input
                  id="newSupplierLocation"
                  value={newSupplierLocation}
                  onChange={(e) => setNewSupplierLocation(e.target.value)}
                  placeholder="Riyadh, Al Malaz District"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setIsAddDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleAddNewSupplier}>
                <Plus className="h-4 w-4 mr-2" />
                Add Supplier
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {selectedSupplier && (
        <div className="text-sm text-muted-foreground space-y-1 pt-2 border-t">
          {selectedSupplier.mobile && (
            <div className="flex items-center gap-2">
              <span className="font-medium">Mobile:</span>
              <span>{selectedSupplier.mobile}</span>
            </div>
          )}
          {selectedSupplier.email && (
            <div className="flex items-center gap-2">
              <span className="font-medium">Email:</span>
              <span>{selectedSupplier.email}</span>
            </div>
          )}
          {selectedSupplier.location && (
            <div className="flex items-center gap-2">
              <span className="font-medium">Location:</span>
              <span>{selectedSupplier.location}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}


