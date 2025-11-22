// Shared employee data that can be used across all components

export interface Employee {
  id: number;
  employeeId: string;
  name: string;
  nameAr: string;
  position: string;
  department: string;
  email: string;
  phone: string;
  status: "active" | "on-leave" | "terminated";
}

export const employees: Employee[] = [
  {
    id: 1,
    employeeId: "EMP-001",
    name: "Mohammed Ahmed",
    nameAr: "محمد أحمد",
    position: "Sales Representative",
    department: "Sales",
    email: "mohammed.ahmed@company.com",
    phone: "+966 50 123 4567",
    status: "active"
  },
  {
    id: 2,
    employeeId: "EMP-002",
    name: "Sarah Ali",
    nameAr: "سارة علي",
    position: "Accountant",
    department: "Finance",
    email: "sarah.ali@company.com",
    phone: "+966 55 234 5678",
    status: "active"
  },
  {
    id: 3,
    employeeId: "EMP-003",
    name: "Ahmed Khalid",
    nameAr: "أحمد خالد",
    position: "IT Specialist",
    department: "IT",
    email: "ahmed.khalid@company.com",
    phone: "+966 56 345 6789",
    status: "active"
  },
  {
    id: 4,
    employeeId: "EMP-004",
    name: "Fatima Hassan",
    nameAr: "فاطمة حسن",
    position: "Finance Manager",
    department: "Finance",
    email: "fatima.hassan@company.com",
    phone: "+966 54 456 7890",
    status: "active"
  },
  {
    id: 5,
    employeeId: "EMP-005",
    name: "Omar Youssef",
    nameAr: "عمر يوسف",
    position: "Sales Manager",
    department: "Sales",
    email: "omar.youssef@company.com",
    phone: "+966 53 567 8901",
    status: "active"
  },
  {
    id: 6,
    employeeId: "EMP-006",
    name: "Layla Ibrahim",
    nameAr: "ليلى إبراهيم",
    position: "HR Manager",
    department: "HR",
    email: "layla.ibrahim@company.com",
    phone: "+966 52 678 9012",
    status: "active"
  },
  {
    id: 7,
    employeeId: "EMP-007",
    name: "Khalid Abdullah",
    nameAr: "خالد عبدالله",
    position: "Warehouse Manager",
    department: "Logistics",
    email: "khalid.abdullah@company.com",
    phone: "+966 51 789 0123",
    status: "active"
  },
  {
    id: 8,
    employeeId: "EMP-008",
    name: "Nora Said",
    nameAr: "نورا سعيد",
    position: "Marketing Specialist",
    department: "Marketing",
    email: "nora.said@company.com",
    phone: "+966 50 890 1234",
    status: "active"
  },
  {
    id: 9,
    employeeId: "EMP-009",
    name: "Abdullah Rahman",
    nameAr: "عبدالله الرحمن",
    position: "Production Manager",
    department: "Manufacturing",
    email: "abdullah.rahman@company.com",
    phone: "+966 55 901 2345",
    status: "active"
  },
  {
    id: 10,
    employeeId: "EMP-010",
    name: "Maha Faisal",
    nameAr: "مها فيصل",
    position: "Customer Service",
    department: "Customer Support",
    email: "maha.faisal@company.com",
    phone: "+966 56 012 3456",
    status: "active"
  }
];

export const getEmployeeById = (employeeId: string): Employee | undefined => {
  return employees.find(emp => emp.employeeId === employeeId);
};

export const getEmployeesByDepartment = (department: string): Employee[] => {
  return employees.filter(emp => emp.department === department && emp.status === "active");
};

export const getActiveEmployees = (): Employee[] => {
  return employees.filter(emp => emp.status === "active");
};
