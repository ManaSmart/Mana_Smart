export interface Reminder {
  id: number;
  title: string;
  description: string;
  date: string;
  time: string;
  type: "visit" | "payment" | "contract" | "follow-up" | "other";
  priority: "high" | "medium" | "low";
  status: "pending" | "completed" | "cancelled";
  customer?: string;
  assignedTo?: string;
  completedAt?: string;
  relatedVisitId?: string;
}

export interface Activity {
  id: number;
  type: "customer" | "lead" | "contract" | "visit" | "payment" | "quotation" | "invoice" | "reminder" | "system";
  action: "created" | "updated" | "deleted" | "completed" | "approved" | "rejected" | "sent" | "received";
  title: string;
  description: string;
  user: string;
  userRole: string;
  timestamp: string;
  relatedEntity?: string;
  details?: {
    oldValue?: string;
    newValue?: string;
    amount?: string;
    status?: string;
  };
}

