-- Create app roles enum
CREATE TYPE public.app_role AS ENUM ('admin', 'cliente');

-- Create user_roles table for secure role management
CREATE TABLE public.user_roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    role app_role NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    UNIQUE (user_id, role)
);

-- Enable RLS on user_roles
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Create security definer function to check roles (prevents RLS recursion)
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
  )
$$;

-- Create empresas table
CREATE TABLE public.empresas (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nome TEXT NOT NULL,
    email TEXT,
    telefone TEXT,
    fuso_horario TEXT DEFAULT 'Europe/Lisbon',
    horario_funcionamento TEXT,
    status TEXT NOT NULL DEFAULT 'ativo',
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.empresas ENABLE ROW LEVEL SECURITY;

-- Create profiles table for user info
CREATE TABLE public.profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
    empresa_id UUID REFERENCES public.empresas(id) ON DELETE SET NULL,
    nome TEXT NOT NULL,
    email TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'ativo',
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Create agentes table
CREATE TABLE public.agentes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id UUID REFERENCES public.empresas(id) ON DELETE CASCADE NOT NULL,
    nome TEXT NOT NULL,
    idioma TEXT DEFAULT 'pt-PT',
    personalidade TEXT,
    prompt_base TEXT,
    regras TEXT,
    status TEXT NOT NULL DEFAULT 'ativo',
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.agentes ENABLE ROW LEVEL SECURITY;

-- Create chamadas table
CREATE TABLE public.chamadas (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id UUID REFERENCES public.empresas(id) ON DELETE CASCADE NOT NULL,
    agente_id UUID REFERENCES public.agentes(id) ON DELETE SET NULL,
    telefone_cliente TEXT NOT NULL,
    data_hora_inicio TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    duracao INTEGER, -- duration in seconds
    intencao_detetada TEXT,
    resultado TEXT,
    status TEXT NOT NULL DEFAULT 'em_andamento',
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.chamadas ENABLE ROW LEVEL SECURITY;

-- Create agendamentos table
CREATE TABLE public.agendamentos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id UUID REFERENCES public.empresas(id) ON DELETE CASCADE NOT NULL,
    chamada_id UUID REFERENCES public.chamadas(id) ON DELETE SET NULL,
    data DATE NOT NULL,
    hora TIME NOT NULL,
    estado TEXT NOT NULL DEFAULT 'pendente',
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.agendamentos ENABLE ROW LEVEL SECURITY;

-- RLS Policies for user_roles (only admins can read roles, users can read their own)
CREATE POLICY "Users can read their own roles"
ON public.user_roles
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Admins can read all roles"
ON public.user_roles
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- RLS Policies for empresas (admin only)
CREATE POLICY "Admins can view all empresas"
ON public.empresas
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can insert empresas"
ON public.empresas
FOR INSERT
TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update empresas"
ON public.empresas
FOR UPDATE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- RLS Policies for profiles
CREATE POLICY "Users can view their own profile"
ON public.profiles
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all profiles"
ON public.profiles
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- RLS Policies for agentes (admin sees all, clients see their empresa)
CREATE POLICY "Admins can view all agentes"
ON public.agentes
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Clients can view their empresa agentes"
ON public.agentes
FOR SELECT
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.profiles
        WHERE profiles.user_id = auth.uid()
        AND profiles.empresa_id = agentes.empresa_id
    )
);

-- RLS Policies for chamadas (admin sees all, clients see their empresa)
CREATE POLICY "Admins can view all chamadas"
ON public.chamadas
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Clients can view their empresa chamadas"
ON public.chamadas
FOR SELECT
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.profiles
        WHERE profiles.user_id = auth.uid()
        AND profiles.empresa_id = chamadas.empresa_id
    )
);

-- RLS Policies for agendamentos (admin sees all, clients see their empresa)
CREATE POLICY "Admins can view all agendamentos"
ON public.agendamentos
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Clients can view their empresa agendamentos"
ON public.agendamentos
FOR SELECT
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.profiles
        WHERE profiles.user_id = auth.uid()
        AND profiles.empresa_id = agendamentos.empresa_id
    )
);