export interface SupplierRecord {
  id: number;
  supplierCode: string;
  nameEn: string;
  nameAr: string;
  contactPerson: string;
  phone: string;
  email: string;
  address: string;
  city: string;
  country: string;
  category: "raw-materials" | "packaging" | "equipment" | "services" | "other";
  taxNumber: string;
  paymentTerms: string;
  creditLimit: number;
  currentBalance: number;
  totalPurchases: number;
  status: "active" | "inactive" | "blocked";
  createdAt: string;
  notes: string;
}

export const initialSuppliers: SupplierRecord[] = [
  {
    id: 1,
    supplierCode: "SUP-001",
    nameEn: "Arabian Fragrance Co.",
    nameAr: "شركة العطور العربية",
    contactPerson: "Ahmed Hassan",
    phone: "+966 50 123 4567",
    email: "info@arabianfragrance.com",
    address: "King Fahd Road",
    city: "Riyadh",
    country: "Saudi Arabia",
    category: "raw-materials",
    taxNumber: "300012345600003",
    paymentTerms: "Net 30",
    creditLimit: 100000,
    currentBalance: -25000,
    totalPurchases: 450000,
    status: "active",
    createdAt: "2024-01-15",
    notes: "Main supplier for essential oils"
  },
  {
    id: 2,
    supplierCode: "SUP-002",
    nameEn: "Premium Packaging Ltd.",
    nameAr: "التغليف المتميز المحدودة",
    contactPerson: "Mohammed Ali",
    phone: "+966 55 987 6543",
    email: "sales@premiumpack.com",
    address: "Industrial Area",
    city: "Jeddah",
    country: "Saudi Arabia",
    category: "packaging",
    taxNumber: "300098765400003",
    paymentTerms: "Net 45",
    creditLimit: 75000,
    currentBalance: -15000,
    totalPurchases: 320000,
    status: "active",
    createdAt: "2024-02-20",
    notes: "Bottles and packaging materials"
  },
  {
    id: 3,
    supplierCode: "SUP-003",
    nameEn: "Global Equipment Trading",
    nameAr: "التجارة العالمية للمعدات",
    contactPerson: "Fatima Youssef",
    phone: "+966 54 321 9876",
    email: "contact@globalequip.com",
    address: "Al Malaz District",
    city: "Riyadh",
    country: "Saudi Arabia",
    category: "equipment",
    taxNumber: "300045678900003",
    paymentTerms: "Net 15",
    creditLimit: 150000,
    currentBalance: 0,
    totalPurchases: 180000,
    status: "active",
    createdAt: "2024-03-10",
    notes: "Manufacturing equipment and tools"
  },
  {
    id: 4,
    supplierCode: "SUP-004",
    nameEn: "Express Logistics Services",
    nameAr: "خدمات اللوجستيات السريعة",
    contactPerson: "Omar Ibrahim",
    phone: "+966 53 456 7890",
    email: "info@expresslogistics.sa",
    address: "Port Area",
    city: "Dammam",
    country: "Saudi Arabia",
    category: "services",
    taxNumber: "300067890100003",
    paymentTerms: "Net 7",
    creditLimit: 50000,
    currentBalance: -8500,
    totalPurchases: 95000,
    status: "active",
    createdAt: "2024-04-05",
    notes: "Shipping and logistics services"
  }
];


