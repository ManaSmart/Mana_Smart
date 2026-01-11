import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabaseClient';
import type { Invoices as InvoiceRow } from '../../supabase/models/invoices';
import type { Customers } from '../../supabase/models/customers';
import type { Payments as PaymentRow } from '../../supabase/models/payments';
import type { Contracts } from '../../supabase/models/contracts';
import { toast } from 'sonner';

// Types for optimized data fetching
export interface InvoiceWithCustomer extends InvoiceRow {
  customer: Pick<Customers, 'customer_name' | 'contact_num' | 'customer_address' | 'commercial_register' | 'vat_number'> | null;
}

// Lightweight type for list view (performance optimized)
export interface InvoiceListItem {
  invoice_id: string;
  customer_id: string;
  invoice_date: string;
  total_amount: number;
  paid_amount: number;
  payment_status: string;
  created_at: string;
  contract_id?: string;
  customer: {
    customer_name: string;
    contact_num?: string;
    customer_address?: string;
  } | null;
}

export interface InvoiceWithDetails extends InvoiceWithCustomer {
  payments: PaymentRow[];
  contract: Pick<Contracts, 'contract_id' | 'contract_number' | 'contract_amount'> | null;
}

// Query keys for cache management
export const invoiceKeys = {
  all: ['invoices'] as const,
  lists: () => [...invoiceKeys.all, 'list'] as const,
  list: (filters: InvoiceListFilters) => [...invoiceKeys.lists(), filters] as const,
  details: () => [...invoiceKeys.all, 'detail'] as const,
  detail: (id: string) => [...invoiceKeys.details(), id] as const,
  payments: (id: string) => [...invoiceKeys.detail(id), 'payments'] as const,
};

export interface InvoiceListFilters {
  page?: number;
  limit?: number;
  status?: 'all' | 'paid' | 'partial' | 'draft';
  search?: string;
  customerId?: string;
  dateFrom?: string;
  dateTo?: string;
  orderBy?: string;
  invoiceType?: 'normal' | 'monthly_visit';
}

// Optimized hook for fetching invoices with pagination and filtering
export function useInvoices(filters: InvoiceListFilters = {}) {
  const {
    page = 1,
    limit = 20,
    status = 'all',
    search = '',
    customerId,
    dateFrom,
    dateTo,
    orderBy = 'created_at.desc',
    invoiceType,
  } = filters;

  return useQuery({
    queryKey: invoiceKeys.list(filters),
    queryFn: async () => {
      let query = supabase
        .from('invoices')
        .select(`
          invoice_id,
          customer_id,
          invoice_date,
          total_amount,
          paid_amount,
          payment_status,
          created_at,
          contract_id,
          customer:customers(
            customer_name,
            contact_num,
            customer_address
          )
        `, { count: 'exact' })
        .order(orderBy.split('.')[0], { 
          ascending: orderBy.includes('.asc') 
        });

      // Apply filters
      if (status !== 'all') {
        query = query.eq('payment_status', status);
      }

      if (customerId) {
        query = query.eq('customer_id', customerId);
      }

      if (invoiceType) {
        if (invoiceType === 'monthly_visit') {
          query = query.not('contract_id', 'is', null);
        } else {
          query = query.is('contract_id', null);
        }
      }

      if (dateFrom) {
        query = query.gte('invoice_date', dateFrom);
      }

      if (dateTo) {
        query = query.lte('invoice_date', dateTo);
      }

      if (search) {
        // Optimize search: only search invoice_number, avoid expensive customer joins in search
        query = query.or(`
          invoice_number.ilike.%${search}%,
          invoice_id.ilike.%${search}%
        `);
      }

      // Apply pagination
      const from = (page - 1) * limit;
      const to = from + limit - 1;
      query = query.range(from, to);

      const { data, error, count } = await query;

      if (error) throw error;

      return {
        invoices: data as any[],
        totalCount: count || 0,
        currentPage: page,
        totalPages: Math.ceil((count || 0) / limit),
      };
    },
    staleTime: 2 * 60 * 1000, // 2 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
    placeholderData: (previousData) => previousData, // Keep previous data while loading
  });
}

// Hook for fetching a single invoice with full details
export function useInvoice(id: string, enabled = true) {
  return useQuery({
    queryKey: invoiceKeys.detail(id),
    queryFn: async () => {
      const { data: invoice, error: invoiceError } = await supabase
        .from('invoices')
        .select(`
          *,
          customer:customers(
            customer_name,
            contact_num,
            customer_address,
            commercial_register,
            vat_number
          ),
          contract:contracts(
            contract_id,
            contract_number,
            contract_amount
          )
        `)
        .eq('invoice_id', id)
        .single();

      if (invoiceError) throw invoiceError;

      // Fetch payments separately to avoid complex joins
      const { data: payments, error: paymentsError } = await supabase
        .from('payments')
        .select('*')
        .eq('invoice_id', id)
        .order('payment_date', { ascending: true });

      if (paymentsError) throw paymentsError;

      return {
        ...invoice,
        payments: payments || [],
      } as InvoiceWithDetails;
    },
    enabled: enabled && !!id,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}

// Hook for fetching invoice payments
export function useInvoicePayments(invoiceId: string) {
  return useQuery({
    queryKey: invoiceKeys.payments(invoiceId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('payments')
        .select('*')
        .eq('invoice_id', invoiceId)
        .order('payment_date', { ascending: true });

      if (error) throw error;
      return data as PaymentRow[];
    },
    enabled: !!invoiceId,
    staleTime: 5 * 60 * 1000,
  });
}

// Mutation for creating invoices
export function useCreateInvoice() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (invoiceData: Partial<InvoiceRow>) => {
      const { data, error } = await supabase
        .from('invoices')
        .insert(invoiceData)
        .select()
        .single();

      if (error) throw error;
      return data as InvoiceRow;
    },
    onSuccess: (newInvoice) => {
      // Invalidate and refetch invoices list
      queryClient.invalidateQueries({ queryKey: invoiceKeys.lists() });
      
      // Add the new invoice to the cache
      queryClient.setQueryData(
        invoiceKeys.detail(newInvoice.invoice_id),
        newInvoice
      );

      toast.success(`Invoice created successfully!`);
    },
    onError: (error: any) => {
      toast.error(`Failed to create invoice: ${error.message}`);
    },
  });
}

// Mutation for updating invoices
export function useUpdateInvoice() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ 
      id, 
      values 
    }: { 
      id: string; 
      values: Partial<InvoiceRow> 
    }) => {
      const { data, error } = await supabase
        .from('invoices')
        .update(values)
        .eq('invoice_id', id)
        .select()
        .single();

      if (error) throw error;
      return data as InvoiceRow;
    },
    onMutate: async ({ id, values }) => {
      // Cancel any outgoing refetches
      await queryClient.cancelQueries({ queryKey: invoiceKeys.detail(id) });

      // Snapshot the previous value
      const previousInvoice = queryClient.getQueryData(
        invoiceKeys.detail(id)
      );

      // Optimistically update to the new value
      queryClient.setQueryData(invoiceKeys.detail(id), (old: any) => 
        old ? { ...old, ...values } : values
      );

      // Return a context object with the snapshotted value
      return { previousInvoice };
    },
    onError: (error, variables, context) => {
      // If the mutation fails, use the context returned from onMutate to roll back
      if (context?.previousInvoice) {
        queryClient.setQueryData(
          invoiceKeys.detail(variables.id),
          context.previousInvoice
        );
      }
      toast.error(`Failed to update invoice: ${error.message}`);
    },
    onSettled: (_, __, variables) => {
      // Always refetch after error or success
      queryClient.invalidateQueries({ queryKey: invoiceKeys.detail(variables.id) });
      queryClient.invalidateQueries({ queryKey: invoiceKeys.lists() });
    },
    onSuccess: () => {
      toast.success('Invoice updated successfully!');
    },
  });
}

// Mutation for deleting invoices
export function useDeleteInvoice() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('invoices')
        .delete()
        .eq('invoice_id', id);

      if (error) throw error;
      return id;
    },
    onSuccess: () => {
      // Invalidate and refetch invoices list
      queryClient.invalidateQueries({ queryKey: invoiceKeys.lists() });
      toast.success('Invoice deleted successfully!');
    },
    onError: (error: any) => {
      toast.error(`Failed to delete invoice: ${error.message}`);
    },
  });
}

// Hook for fetching invoice statistics
export function useInvoiceStats(filters: Partial<InvoiceListFilters> = {}) {
  return useQuery({
    queryKey: ['invoice-stats', filters],
    queryFn: async () => {
      let query = supabase
        .from('invoices')
        .select('total_amount, paid_amount, payment_status', { count: 'exact' });

      // Apply same filters as main query
      if (filters.customerId) {
        query = query.eq('customer_id', filters.customerId);
      }

      if (filters.dateFrom) {
        query = query.gte('created_at', filters.dateFrom);
      }

      if (filters.dateTo) {
        query = query.lte('created_at', filters.dateTo);
      }

      if (filters.status && filters.status !== 'all') {
        query = query.eq('payment_status', filters.status);
      }

      const { data, error } = await query;

      if (error) throw error;

      const invoices = data || [];
      const totalAmount = invoices.reduce((sum, inv) => sum + (inv.total_amount || 0), 0);
      const paidAmount = invoices.reduce((sum, inv) => sum + (inv.paid_amount || 0), 0);
      const unpaidAmount = totalAmount - paidAmount;

      const statusCounts = invoices.reduce((acc, inv) => {
        acc[inv.payment_status || 'draft'] = (acc[inv.payment_status || 'draft'] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);

      return {
        totalAmount,
        paidAmount,
        unpaidAmount,
        totalCount: invoices.length,
        statusCounts,
      };
    },
    staleTime: 5 * 60 * 1000,
  });
}
