/// <reference types="vite/client" />
import { createClient, SupabaseClient } from '@supabase/supabase-js';

let supabaseClient: SupabaseClient | null = null;

export function getSupabaseClient(): SupabaseClient {
	if (supabaseClient) return supabaseClient;
	const url = import.meta.env.VITE_SUPABASE_URL as string;
	const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;
	if (!url || !anonKey) {
		throw new Error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY');
	}
	supabaseClient = createClient(url, anonKey);
	return supabaseClient;
}

export type { SupabaseClient };


