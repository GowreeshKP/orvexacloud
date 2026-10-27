// --- Supabase Database Schema Types ---
// Generated TypeScript definitions for Orvexa Cloud Master Database

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export interface Database {
  public: {
    Tables: {
      tenants: {
        Row: {
          id: string
          slug: string
          brand_name: string
          owner_name: string
          owner_email: string
          owner_phone: string | null
          status: 'active' | 'pending' | 'suspended'
          plan: 'starter' | 'growth' | 'enterprise'
          custom_domain: string | null
          logo_url: string | null
          theme_config: Json | null
          store_database_uri: string | null // BYODB connection string for tenant's private customer DB
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          slug: string
          brand_name: string
          owner_name: string
          owner_email: string
          owner_phone?: string | null
          status?: 'active' | 'pending' | 'suspended'
          plan?: 'starter' | 'growth' | 'enterprise'
          custom_domain?: string | null
          logo_url?: string | null
          theme_config?: Json | null
          store_database_uri?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          slug?: string
          brand_name?: string
          owner_name?: string
          owner_email?: string
          owner_phone?: string | null
          status?: 'active' | 'pending' | 'suspended'
          plan?: 'starter' | 'growth' | 'enterprise'
          custom_domain?: string | null
          logo_url?: string | null
          theme_config?: Json | null
          store_database_uri?: string | null
          updated_at?: string
        }
      }
      store_credentials: {
        Row: {
          id: string
          tenant_slug: string
          owner_email: string
          password_hash: string
          staff_members: Json | null
          updated_at: string
        }
        Insert: {
          id?: string
          tenant_slug: string
          owner_email: string
          password_hash: string
          staff_members?: Json | null
          updated_at?: string
        }
        Update: {
          id?: string
          tenant_slug?: string
          owner_email?: string
          password_hash?: string
          staff_members?: Json | null
          updated_at?: string
        }
      }
      audit_logs: {
        Row: {
          id: string
          tenant_slug: string | null
          tenant_name: string | null
          actor_id: string
          actor_name: string
          actor_role: 'super_admin' | 'seller' | 'staff' | 'system'
          action: string
          category: 'auth' | 'security' | 'products' | 'orders' | 'branding' | 'billing' | 'provisioning' | 'database' | 'settings'
          severity: 'info' | 'warning' | 'security' | 'critical'
          details: string
          ip_address: string | null
          user_agent: string | null
          metadata: Json | null
          created_at: string
        }
        Insert: {
          id?: string
          tenant_slug?: string | null
          tenant_name?: string | null
          actor_id: string
          actor_name: string
          actor_role: 'super_admin' | 'seller' | 'staff' | 'system'
          action: string
          category: 'auth' | 'security' | 'products' | 'orders' | 'branding' | 'billing' | 'provisioning' | 'database' | 'settings'
          severity?: 'info' | 'warning' | 'security' | 'critical'
          details: string
          ip_address?: string | null
          user_agent?: string | null
          metadata?: Json | null
          created_at?: string
        }
        Update: {
          id?: string
          tenant_slug?: string | null
          tenant_name?: string | null
          actor_id?: string
          actor_name?: string
          actor_role?: 'super_admin' | 'seller' | 'staff' | 'system'
          action?: string
          category?: 'auth' | 'security' | 'products' | 'orders' | 'branding' | 'billing' | 'provisioning' | 'database' | 'settings'
          severity?: 'info' | 'warning' | 'security' | 'critical'
          details?: string
          ip_address?: string | null
          user_agent?: string | null
          metadata?: Json | null
        }
      }
      merchant_applications: {
        Row: {
          id: string
          business_name: string
          applicant_name: string
          email: string
          phone: string | null
          category: string | null
          requested_slug: string | null
          status: 'pending' | 'approved' | 'rejected'
          created_at: string
        }
        Insert: {
          id?: string
          business_name: string
          applicant_name: string
          email: string
          phone?: string | null
          category?: string | null
          requested_slug?: string | null
          status?: 'pending' | 'approved' | 'rejected'
          created_at?: string
        }
        Update: {
          id?: string
          business_name?: string
          applicant_name?: string
          email?: string
          phone?: string | null
          category?: string | null
          requested_slug?: string | null
          status?: 'pending' | 'approved' | 'rejected'
        }
      }
    }
  }
}
