
-- Create customers table
CREATE TABLE public.customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  name text,
  email text,
  phone text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  last_seen_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;

-- RLS policies for customers
CREATE POLICY "Admins can manage all customers" ON public.customers FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Clients can view their empresa customers" ON public.customers FOR SELECT
  USING (empresa_id = get_user_empresa_id(auth.uid()));

-- Create customer_identifiers table
CREATE TABLE public.customer_identifiers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  type text NOT NULL,
  value text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(type, value)
);

-- Enable RLS
ALTER TABLE public.customer_identifiers ENABLE ROW LEVEL SECURITY;

-- RLS policies for customer_identifiers
CREATE POLICY "Admins can manage all customer_identifiers" ON public.customer_identifiers FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Clients can view their empresa customer_identifiers" ON public.customer_identifiers FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.customers c
    WHERE c.id = customer_identifiers.customer_id
    AND c.empresa_id = get_user_empresa_id(auth.uid())
  ));

-- Add customer_id to conversations
ALTER TABLE public.conversations ADD COLUMN customer_id uuid REFERENCES public.customers(id);

-- Index for lookups
CREATE INDEX idx_customer_identifiers_lookup ON public.customer_identifiers(type, value);
CREATE INDEX idx_conversations_customer_id ON public.conversations(customer_id);
CREATE INDEX idx_customers_empresa_id ON public.customers(empresa_id);
