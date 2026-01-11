import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabaseClient';
import type { Inventory } from '../../supabase/models/inventory';
import { toast } from 'sonner';

// Query keys for cache management
export const inventoryKeys = {
  all: ['inventory'] as const,
  lists: () => [...inventoryKeys.all, 'list'] as const,
  list: (filters: InventoryListFilters) => [...inventoryKeys.lists(), filters] as const,
  details: () => [...inventoryKeys.all, 'detail'] as const,
  detail: (id: string) => [...inventoryKeys.details(), id] as const,
  search: (term: string) => [...inventoryKeys.all, 'search', term] as const,
};

export interface InventoryListFilters {
  page?: number;
  limit?: number;
  search?: string;
  category?: string;
  status?: 'all' | 'in-stock' | 'out-of-stock' | 'low-stock';
  orderBy?: string;
  minStock?: number;
  maxStock?: number;
}

// Optimized hook for fetching inventory with pagination and filtering
export function useInventory(filters: InventoryListFilters = {}) {
  const {
    page = 1,
    limit = 50,
    search = '',
    category = '',
    status = 'all',
    orderBy = 'en_prod_name.asc',
    minStock,
    maxStock,
  } = filters;

  return useQuery({
    queryKey: inventoryKeys.list(filters),
    queryFn: async () => {
      let query = supabase
        .from('inventory')
        .select(`
          product_code,
          en_prod_name,
          ar_prod_name,
          category,
          prod_selling_price,
          prod_cost_price,
          current_stock,
          minimum_stock_alert,
          prod_status,
          prod_img,
          measuring_unit,
          prod_supplier,
          prod_en_description,
          prod_ar_description,
          created_at,
          updated_at
        `)
        .order(orderBy.split('.')[0], { 
          ascending: orderBy.includes('.asc') 
        });

      // Apply filters
      if (category) {
        query = query.eq('category', category);
      }

      if (status !== 'all') {
        switch (status) {
          case 'in-stock':
            query = query.gte('current_stock', 'minimum_stock_alert');
            break;
          case 'out-of-stock':
            query = query.eq('current_stock', 0);
            break;
          case 'low-stock':
            query = query.lt('current_stock', 'minimum_stock_alert').gt('current_stock', 0);
            break;
        }
      }

      if (minStock !== undefined) {
        query = query.gte('current_stock', minStock);
      }

      if (maxStock !== undefined) {
        query = query.lte('current_stock', maxStock);
      }

      if (search) {
        query = query.or(`
          en_prod_name.ilike.%${search}%,
          ar_prod_name.ilike.%${search}%,
          product_code.ilike.%${search}%,
          category.ilike.%${search}%
        `);
      }

      // Apply pagination
      const from = (page - 1) * limit;
      const to = from + limit - 1;
      query = query.range(from, to);

      const { data, error, count } = await query;

      if (error) throw error;

      return {
        items: data || [],
        totalCount: count || 0,
        currentPage: page,
        totalPages: Math.ceil((count || 0) / limit),
      };
    },
    staleTime: 3 * 60 * 1000, // 3 minutes - inventory changes moderately
    gcTime: 10 * 60 * 1000, // 10 minutes
    placeholderData: (previousData) => previousData,
  });
}

// Hook for fetching a single inventory item
export function useInventoryItem(productCode: string, enabled = true) {
  return useQuery({
    queryKey: inventoryKeys.detail(productCode),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('inventory')
        .select('*')
        .eq('product_code', productCode)
        .single();

      if (error) throw error;
      return data as Inventory;
    },
    enabled: enabled && !!productCode,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}

// Hook for inventory search (optimized for dropdowns/autocomplete)
export function useInventorySearch(searchTerm: string, enabled = true) {
  return useQuery({
    queryKey: inventoryKeys.search(searchTerm),
    queryFn: async () => {
      if (!searchTerm.trim()) return [];

      const { data, error } = await supabase
        .from('inventory')
        .select(`
          product_code,
          en_prod_name,
          ar_prod_name,
          category,
          prod_selling_price,
          prod_cost_price,
          current_stock,
          prod_img,
          measuring_unit
        `)
        .or(`
          en_prod_name.ilike.%${searchTerm}%,
          ar_prod_name.ilike.%${searchTerm}%,
          product_code.ilike.%${searchTerm}%
        `)
        .order('en_prod_name')
        .limit(50);

      if (error) throw error;
      return data || [];
    },
    enabled: enabled && searchTerm.trim().length > 0,
    staleTime: 2 * 60 * 1000, // 2 minutes for search results
    gcTime: 5 * 60 * 1000, // 5 minutes
  });
}

// Hook for fetching inventory categories
export function useInventoryCategories() {
  return useQuery({
    queryKey: [...inventoryKeys.all, 'categories'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('inventory')
        .select('category')
        .not('category', 'is', null)
        .not('category', 'eq', '');

      if (error) throw error;

      // Extract unique categories
      const categories = [...new Set((data || []).map(item => item.category).filter(Boolean))];
      return categories.sort();
    },
    staleTime: 30 * 60 * 1000, // 30 minutes - categories change rarely
    gcTime: 60 * 60 * 1000, // 1 hour
  });
}

// Mutation for creating inventory items
export function useCreateInventoryItem() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (itemData: Partial<Inventory>) => {
      const { data, error } = await supabase
        .from('inventory')
        .insert(itemData)
        .select()
        .single();

      if (error) throw error;
      return data as Inventory;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: inventoryKeys.lists() });
      queryClient.invalidateQueries({ queryKey: [...inventoryKeys.all, 'categories'] });
      toast.success('Product created successfully!');
    },
    onError: (error: any) => {
      toast.error(`Failed to create product: ${error.message}`);
    },
  });
}

// Mutation for updating inventory items
export function useUpdateInventoryItem() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ 
      productCode, 
      values 
    }: { 
      productCode: string; 
      values: Partial<Inventory> 
    }) => {
      const { data, error } = await supabase
        .from('inventory')
        .update(values)
        .eq('product_code', productCode)
        .select()
        .single();

      if (error) throw error;
      return data as Inventory;
    },
    onMutate: async ({ productCode, values }) => {
      await queryClient.cancelQueries({ queryKey: inventoryKeys.detail(productCode) });
      const previousItem = queryClient.getQueryData(inventoryKeys.detail(productCode));
      queryClient.setQueryData(inventoryKeys.detail(productCode), (old: any) => 
        old ? { ...old, ...values } : values
      );
      return { previousItem };
    },
    onError: (error, variables, context) => {
      if (context?.previousItem) {
        queryClient.setQueryData(
          inventoryKeys.detail(variables.productCode),
          context.previousItem
        );
      }
      toast.error(`Failed to update product: ${error.message}`);
    },
    onSettled: (_, __, variables) => {
      queryClient.invalidateQueries({ queryKey: inventoryKeys.detail(variables.productCode) });
      queryClient.invalidateQueries({ queryKey: inventoryKeys.lists() });
    },
    onSuccess: () => {
      toast.success('Product updated successfully!');
    },
  });
}

// Mutation for deleting inventory items
export function useDeleteInventoryItem() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (productCode: string) => {
      const { error } = await supabase
        .from('inventory')
        .delete()
        .eq('product_code', productCode);

      if (error) throw error;
      return productCode;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: inventoryKeys.lists() });
      toast.success('Product deleted successfully!');
    },
    onError: (error: any) => {
      toast.error(`Failed to delete product: ${error.message}`);
    },
  });
}

// Hook for low stock alerts
export function useLowStockItems() {
  return useQuery({
    queryKey: [...inventoryKeys.all, 'low-stock'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('inventory')
        .select(`
          product_code,
          en_prod_name,
          ar_prod_name,
          current_stock,
          minimum_stock_alert,
          category
        `)
        .lt('current_stock', 'minimum_stock_alert')
        .gt('current_stock', 0)
        .order('current_stock', { ascending: true });

      if (error) throw error;
      return data || [];
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
    refetchInterval: 10 * 60 * 1000, // Refetch every 10 minutes
  });
}
