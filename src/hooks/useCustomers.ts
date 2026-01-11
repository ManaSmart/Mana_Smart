import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabaseClient';
import type { Customers } from '../../supabase/models/customers';
import { toast } from 'sonner';

// Query keys for cache management
export const customerKeys = {
  all: ['customers'] as const,
  lists: () => [...customerKeys.all, 'list'] as const,
  list: (filters: CustomerListFilters) => [...customerKeys.lists(), filters] as const,
  details: () => [...customerKeys.all, 'detail'] as const,
  detail: (id: string) => [...customerKeys.details(), id] as const,
};

export interface CustomerListFilters {
  page?: number;
  limit?: number;
  search?: string;
  status?: 'all' | 'active' | 'inactive';
  orderBy?: string;
}

// Optimized hook for fetching customers with pagination and filtering
export function useCustomers(filters: CustomerListFilters = {}) {
  const {
    page = 1,
    limit = 50,
    search = '',
    status = 'all',
    orderBy = 'customer_name.asc',
  } = filters;

  return useQuery({
    queryKey: customerKeys.list(filters),
    queryFn: async () => {
      let query = supabase
        .from('customers')
        .select('customer_id, customer_name, contact_num, customer_email, customer_address, commercial_register, vat_number, status, company, created_at')
        .order(orderBy.split('.')[0], { 
          ascending: orderBy.includes('.asc') 
        });

      // Apply filters
      if (status !== 'all') {
        query = query.eq('status', status);
      }

      if (search) {
        query = query.or(`
          customer_name.ilike.%${search}%,
          company.ilike.%${search}%,
          contact_num.ilike.%${search}%,
          customer_email.ilike.%${search}%
        `);
      }

      // Apply pagination
      const from = (page - 1) * limit;
      const to = from + limit - 1;
      query = query.range(from, to);

      const { data, error, count } = await query;

      if (error) throw error;

      return {
        customers: data || [],
        totalCount: count || 0,
        currentPage: page,
        totalPages: Math.ceil((count || 0) / limit),
      };
    },
    staleTime: 5 * 60 * 1000, // 5 minutes - customer data changes less frequently
    gcTime: 15 * 60 * 1000, // 15 minutes
    placeholderData: (previousData) => previousData,
  });
}

// Hook for fetching a single customer
export function useCustomer(id: string, enabled = true) {
  return useQuery({
    queryKey: customerKeys.detail(id),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('customers')
        .select('*')
        .eq('customer_id', id)
        .single();

      if (error) throw error;
      return data as Customers;
    },
    enabled: enabled && !!id,
    staleTime: 10 * 60 * 1000, // 10 minutes
  });
}

// Mutation for creating customers
export function useCreateCustomer() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (customerData: Partial<Customers>) => {
      const { data, error } = await supabase
        .from('customers')
        .insert(customerData)
        .select()
        .single();

      if (error) throw error;
      return data as Customers;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: customerKeys.lists() });
      toast.success('Customer created successfully!');
    },
    onError: (error: any) => {
      toast.error(`Failed to create customer: ${error.message}`);
    },
  });
}

// Mutation for updating customers
export function useUpdateCustomer() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ 
      id, 
      values 
    }: { 
      id: string; 
      values: Partial<Customers> 
    }) => {
      const { data, error } = await supabase
        .from('customers')
        .update(values)
        .eq('customer_id', id)
        .select()
        .single();

      if (error) throw error;
      return data as Customers;
    },
    onMutate: async ({ id, values }) => {
      await queryClient.cancelQueries({ queryKey: customerKeys.detail(id) });
      const previousCustomer = queryClient.getQueryData(customerKeys.detail(id));
      queryClient.setQueryData(customerKeys.detail(id), (old: any) => 
        old ? { ...old, ...values } : values
      );
      return { previousCustomer };
    },
    onError: (error, variables, context) => {
      if (context?.previousCustomer) {
        queryClient.setQueryData(
          customerKeys.detail(variables.id),
          context.previousCustomer
        );
      }
      toast.error(`Failed to update customer: ${error.message}`);
    },
    onSettled: (_, __, variables) => {
      queryClient.invalidateQueries({ queryKey: customerKeys.detail(variables.id) });
      queryClient.invalidateQueries({ queryKey: customerKeys.lists() });
    },
    onSuccess: () => {
      toast.success('Customer updated successfully!');
    },
  });
}

// Mutation for deleting customers
export function useDeleteCustomer() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('customers')
        .delete()
        .eq('customer_id', id);

      if (error) throw error;
      return id;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: customerKeys.lists() });
      toast.success('Customer deleted successfully!');
    },
    onError: (error: any) => {
      toast.error(`Failed to delete customer: ${error.message}`);
    },
  });
}

// Hook for customer search (for dropdowns/autocomplete)
export function useCustomerSearch(searchTerm: string, enabled = true) {
  return useQuery({
    queryKey: ['customer-search', searchTerm],
    queryFn: async () => {
      if (!searchTerm.trim()) return [];

      const { data, error } = await supabase
        .from('customers')
        .select('customer_id, customer_name, company, contact_num, customer_email')
        .or(`
          customer_name.ilike.%${searchTerm}%,
          company.ilike.%${searchTerm}%,
          contact_num.ilike.%${searchTerm}%
        `)
        .order('customer_name')
        .limit(20);

      if (error) throw error;
      return data || [];
    },
    enabled: enabled && searchTerm.trim().length > 0,
    staleTime: 2 * 60 * 1000, // 2 minutes for search results
    gcTime: 5 * 60 * 1000, // 5 minutes
  });
}
