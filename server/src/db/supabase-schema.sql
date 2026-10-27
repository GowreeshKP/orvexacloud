-- =============================================================================
-- ORVEXA TECH — D2C MULTI-TENANT WEB APPLICATION
-- MASTER SUPABASE / POSTGRESQL DATABASE SCHEMA
-- Project: D2C-Multi-tenant-webapp (https://xkiutrwppsnvvogmxtby.supabase.co)
-- =============================================================================
-- This schema provisions the Tier-1 Orvexa Cloud Master Database tables.
-- Customer PII and order transactions are isolated in Tier-2 Store Owner DBs.
-- =============================================================================

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. TENANTS DIRECTORY (Store Master Registry)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.tenants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT UNIQUE NOT NULL,
  brand_name TEXT NOT NULL,
  owner_name TEXT NOT NULL,
  owner_email TEXT NOT NULL,
  owner_phone TEXT,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'pending', 'suspended')),
  plan TEXT DEFAULT 'growth' CHECK (plan IN ('starter', 'growth', 'enterprise')),
  custom_domain TEXT,
  logo_url TEXT,
  theme_config JSONB DEFAULT '{
    "primaryColor": "#1e293b",
    "accentColor": "#6366f1",
    "fontFamily": "Inter",
    "borderRadius": "8px"
  }'::jsonb,
  -- BYODB: Store owner's private isolated database connection string (MongoDB or PostgreSQL)
  store_database_uri TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. STORE OWNER AUTHENTICATION & STAFF SUB-ACCOUNTS
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.store_credentials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_slug TEXT NOT NULL REFERENCES public.tenants(slug) ON DELETE CASCADE,
  owner_email TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  staff_members JSONB DEFAULT '[]'::jsonb,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT uq_tenant_credentials UNIQUE (tenant_slug)
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. AUDIT LOGGING LEDGER (Platform Governance & Merchant Security Trails)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_slug TEXT,
  tenant_name TEXT,
  actor_id TEXT NOT NULL,
  actor_name TEXT NOT NULL,
  actor_role TEXT NOT NULL CHECK (actor_role IN ('super_admin', 'seller', 'staff', 'system')),
  action TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('auth', 'security', 'products', 'orders', 'branding', 'billing', 'provisioning', 'database', 'settings')),
  severity TEXT NOT NULL DEFAULT 'info' CHECK (severity IN ('info', 'warning', 'security', 'critical')),
  details TEXT NOT NULL,
  ip_address TEXT,
  user_agent TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. MERCHANT ACQUISITION CRM & APPLICATIONS
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.merchant_applications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_name TEXT NOT NULL,
  applicant_name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  category TEXT,
  requested_slug TEXT,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. INDEXES FOR HIGH-THROUGHPUT MULTI-TENANT QUERY ROUTING
-- ─────────────────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_tenants_slug ON public.tenants(slug);
CREATE INDEX IF NOT EXISTS idx_tenants_status ON public.tenants(status);
CREATE INDEX IF NOT EXISTS idx_credentials_slug ON public.store_credentials(tenant_slug);
CREATE INDEX IF NOT EXISTS idx_audit_tenant ON public.audit_logs(tenant_slug);
CREATE INDEX IF NOT EXISTS idx_audit_category ON public.audit_logs(category);
CREATE INDEX IF NOT EXISTS idx_audit_created ON public.audit_logs(created_at DESC);

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. ROW LEVEL SECURITY (RLS) POLICIES
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.store_credentials ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.merchant_applications ENABLE ROW LEVEL SECURITY;

-- Allow public read access to active store tenant profiles (for storefront routing)
CREATE POLICY "Public can view active tenants" 
  ON public.tenants FOR SELECT 
  USING (status = 'active');

-- Service role has full unrestricted bypass for super admin backend operations
CREATE POLICY "Service role full access tenants" 
  ON public.tenants FOR ALL 
  TO service_role 
  USING (true);

CREATE POLICY "Service role full access credentials" 
  ON public.store_credentials FOR ALL 
  TO service_role 
  USING (true);

CREATE POLICY "Service role full access audit_logs" 
  ON public.audit_logs FOR ALL 
  TO service_role 
  USING (true);

CREATE POLICY "Service role full access applications" 
  ON public.merchant_applications FOR ALL 
  TO service_role 
  USING (true);

-- Allow public submission of merchant applications
CREATE POLICY "Public can submit merchant applications" 
  ON public.merchant_applications FOR INSERT 
  WITH CHECK (true);

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. INITIAL SEED DATA FOR DEMO STORES
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO public.tenants (slug, brand_name, owner_name, owner_email, plan, status, theme_config)
VALUES 
  ('lunar', 'The Lunar Clothing', 'Gowreesh KP', 'gowreesh@thelunarclothing.com', 'growth', 'active', '{"primaryColor":"#8C5A4F","accentColor":"#D4AF37","fontFamily":"Cinzel"}'::jsonb),
  ('silkhaus', 'Silk Haus', 'Kavya Menon', 'kavya@silkhaus.in', 'enterprise', 'active', '{"primaryColor":"#6B2D5C","accentColor":"#F5E6CC","fontFamily":"Playfair Display"}'::jsonb),
  ('aura', 'Aura Ceramics', 'Rohan Verma', 'rohan@auraceramics.com', 'starter', 'active', '{"primaryColor":"#2D4A3E","accentColor":"#E8DCC4","fontFamily":"Plus Jakarta Sans"}'::jsonb)
ON CONFLICT (slug) DO NOTHING;
