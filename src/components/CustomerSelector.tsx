import { useState } from "react";
import { Search, Plus, X } from "lucide-react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "./ui/dialog";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "./ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";
import { toast } from "sonner";
import { useAppDispatch } from "../redux-toolkit/hooks";
import { thunks } from "../redux-toolkit/slices";

export interface Customer {
  id: number;
  name: string;
  company: string;
  mobile: string;
  email: string;
  location: string;
  contractType?: string;
  monthlyAmount?: number;
  startDate?: string;
  status?: "active" | "inactive" | "pending";
  representative?: string;
  representativeId?: number;
  commercialRegister?: string;
  taxNumber?: string;
}

interface CustomerSelectorProps {
  customers: Customer[];
  selectedCustomerId?: number;
  onCustomerSelect: (customer: Customer) => void;
  onCustomerAdd?: (customer: Customer) => void;
  label?: string;
  placeholder?: string;
  required?: boolean;
  hideQuickAdd?: boolean;
}

export function CustomerSelector({
  customers,
  selectedCustomerId,
  onCustomerSelect,
  onCustomerAdd,
  label = "Customer",
  placeholder = "Search customer...",
  required = false,
  hideQuickAdd = false,
}: CustomerSelectorProps) {
  const dispatch = useAppDispatch();
  const [open, setOpen] = useState(false);
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  
  // Quick Add Customer Form States
  const [newCustomerName, setNewCustomerName] = useState("");
  const [newCustomerCompany, setNewCustomerCompany] = useState("");
  const [newCustomerMobile, setNewCustomerMobile] = useState("");
  const [newCustomerEmail, setNewCustomerEmail] = useState("");
  const [newCustomerLocation, setNewCustomerLocation] = useState("");
  const [newCustomerCommercialRegister, setNewCustomerCommercialRegister] = useState("");
  const [newCustomerTaxNumber, setNewCustomerTaxNumber] = useState("");

  const selectedCustomer = customers.find(c => c.id === selectedCustomerId);


  const handleAddNewCustomer = async () => {
    if (!newCustomerName.trim() || !newCustomerMobile.trim()) {
      toast.error("Please enter customer name and mobile number");
      return;
    }

    const values: any = {
      customer_name: newCustomerName.trim(),
      company: newCustomerCompany.trim() || null,
      contact_num: newCustomerMobile.trim(),
      customer_email: newCustomerEmail.trim() || null,
      customer_address: newCustomerLocation.trim() || null,
      contract_type: null,
      monthly_amount: 0,
      status: 'active',
      delegate_id: null,
      commercial_register: newCustomerCommercialRegister.trim() || null,
      vat_number: newCustomerTaxNumber.trim() || null,
    };

    try {
      await dispatch(thunks.customers.createOne(values)).unwrap();
      
      // Create a customer object for the UI
      const newCustomer: Customer = {
        id: Date.now(), // Temporary ID, will be replaced when customers list refreshes
        name: newCustomerName.trim(),
        company: newCustomerCompany.trim(),
        mobile: newCustomerMobile.trim(),
        email: newCustomerEmail.trim(),
        location: newCustomerLocation.trim(),
        commercialRegister: newCustomerCommercialRegister.trim(),
        taxNumber: newCustomerTaxNumber.trim(),
        status: "active"
      };

      if (onCustomerAdd) {
        onCustomerAdd(newCustomer);
      }
      
      onCustomerSelect(newCustomer);
      
      // Reset form
      setNewCustomerName("");
      setNewCustomerCompany("");
      setNewCustomerMobile("");
      setNewCustomerEmail("");
      setNewCustomerLocation("");
      setNewCustomerCommercialRegister("");
      setNewCustomerTaxNumber("");
      setIsAddDialogOpen(false);
      
      toast.success("Customer added successfully!");
      
      // Refresh customers list
      dispatch(thunks.customers.fetchAll(undefined));
    } catch (error: any) {
      toast.error(error?.message || "Failed to add customer");
    }
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
              {selectedCustomer ? (
                <div className="flex flex-col items-start overflow-hidden">
                  <span className="font-medium truncate max-w-full">{selectedCustomer.name}</span>
                  {selectedCustomer.company && (
                    <span className="text-xs text-muted-foreground truncate max-w-full">{selectedCustomer.company}</span>
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
              <CommandInput placeholder="Search by name, company, or mobile..." />
              <CommandList>
                <CommandEmpty>No customer found.</CommandEmpty>
                <CommandGroup>
                  {customers.map((customer) => (
                    <CommandItem
                      key={customer.id}
                      value={`${customer.name} ${customer.company} ${customer.mobile}`}
                      onSelect={() => {
                        onCustomerSelect(customer);
                        setOpen(false);
                      }}
                    >
                      <div className="flex flex-col">
                        <span className="font-medium">{customer.name}</span>
                        <div className="flex gap-2 text-xs text-muted-foreground">
                          {customer.company && <span>{customer.company}</span>}
                          <span>•</span>
                          <span>{customer.mobile}</span>
                        </div>
                      </div>
                    </CommandItem>
                  ))}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>

        {selectedCustomer && (
          <Button
            variant="outline"
            size="icon"
            onClick={() => onCustomerSelect({} as Customer)}
            title="Clear selection"
            className="shrink-0"
          >
            <X className="h-4 w-4" />
          </Button>
        )}

        {!hideQuickAdd && (
          <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
            <DialogTrigger asChild>
              <Button 
                variant="default" 
                size="icon" 
                title="Add new customer"
                className="shrink-0 bg-green-600 hover:bg-green-700"
              >
                <Plus className="h-4 w-4" />
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle>Add New Customer</DialogTitle>
                <DialogDescription>
                  Quickly add a new customer without leaving this page
                </DialogDescription>
              </DialogHeader>

              <div className="grid grid-cols-2 gap-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="newCustomerName">
                    Customer Name <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="newCustomerName"
                    value={newCustomerName}
                    onChange={(e) => setNewCustomerName(e.target.value)}
                    placeholder="Ahmed Mohammed"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="newCustomerCompany">Company Name</Label>
                  <Input
                    id="newCustomerCompany"
                    value={newCustomerCompany}
                    onChange={(e) => setNewCustomerCompany(e.target.value)}
                    placeholder="Palm Trading Company"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="newCustomerMobile">
                    Mobile Number <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="newCustomerMobile"
                    value={newCustomerMobile}
                    onChange={(e) => setNewCustomerMobile(e.target.value)}
                    placeholder="0501234567"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="newCustomerEmail">Email</Label>
                  <Input
                    id="newCustomerEmail"
                    type="email"
                    value={newCustomerEmail}
                    onChange={(e) => setNewCustomerEmail(e.target.value)}
                    placeholder="customer@example.com"
                  />
                </div>

                <div className="col-span-2 space-y-2">
                  <Label htmlFor="newCustomerLocation">Location</Label>
                  <Input
                    id="newCustomerLocation"
                    value={newCustomerLocation}
                    onChange={(e) => setNewCustomerLocation(e.target.value)}
                    placeholder="Riyadh, Al Malaz District"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="newCustomerCommercialRegister">Commercial Register</Label>
                  <Input
                    id="newCustomerCommercialRegister"
                    value={newCustomerCommercialRegister}
                    onChange={(e) => setNewCustomerCommercialRegister(e.target.value)}
                    placeholder="1010123456"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="newCustomerTaxNumber">VAT Number</Label>
                  <Input
                    id="newCustomerTaxNumber"
                    value={newCustomerTaxNumber}
                    onChange={(e) => setNewCustomerTaxNumber(e.target.value)}
                    placeholder="300159475400003"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setIsAddDialogOpen(false)}>
                  Cancel
                </Button>
                <Button onClick={handleAddNewCustomer}>
                  <Plus className="h-4 w-4 mr-2" />
                  Add Customer
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        )}
      </div>

      {selectedCustomer && (
        <div className="text-sm text-muted-foreground space-y-1 pt-2 border-t">
          {selectedCustomer.mobile && (
            <div className="flex items-center gap-2">
              <span className="font-medium">Mobile:</span>
              <span>{selectedCustomer.mobile}</span>
            </div>
          )}
          {selectedCustomer.email && (
            <div className="flex items-center gap-2">
              <span className="font-medium">Email:</span>
              <span>{selectedCustomer.email}</span>
            </div>
          )}
          {selectedCustomer.location && (
            <div className="flex items-center gap-2">
              <span className="font-medium">Location:</span>
              <span>{selectedCustomer.location}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
