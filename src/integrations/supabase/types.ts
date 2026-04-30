export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.4"
  }
  public: {
    Tables: {
      admin_audit_log: {
        Row: {
          action_type: string
          admin_user_id: string
          created_at: string
          id: string
          metadata: Json | null
          target_id: string | null
          target_type: string
        }
        Insert: {
          action_type: string
          admin_user_id: string
          created_at?: string
          id?: string
          metadata?: Json | null
          target_id?: string | null
          target_type: string
        }
        Update: {
          action_type?: string
          admin_user_id?: string
          created_at?: string
          id?: string
          metadata?: Json | null
          target_id?: string | null
          target_type?: string
        }
        Relationships: []
      }
      agendamentos: {
        Row: {
          agente_id: string | null
          chamada_id: string | null
          cliente_email: string | null
          cliente_nome: string | null
          cliente_telefone: string | null
          created_at: string
          credits_consumed: number
          data: string
          duration_minutes: number | null
          empresa_id: string
          end_datetime: string | null
          estado: string
          execution_id: string | null
          external_calendar_id: string | null
          external_calendar_type: string | null
          external_execution_state: string
          hora: string
          id: string
          notas: string | null
          resource_id: string | null
          scheduling_state: string
          service_id: string | null
          start_datetime: string | null
          updated_at: string
        }
        Insert: {
          agente_id?: string | null
          chamada_id?: string | null
          cliente_email?: string | null
          cliente_nome?: string | null
          cliente_telefone?: string | null
          created_at?: string
          credits_consumed?: number
          data: string
          duration_minutes?: number | null
          empresa_id: string
          end_datetime?: string | null
          estado?: string
          execution_id?: string | null
          external_calendar_id?: string | null
          external_calendar_type?: string | null
          external_execution_state?: string
          hora: string
          id?: string
          notas?: string | null
          resource_id?: string | null
          scheduling_state?: string
          service_id?: string | null
          start_datetime?: string | null
          updated_at?: string
        }
        Update: {
          agente_id?: string | null
          chamada_id?: string | null
          cliente_email?: string | null
          cliente_nome?: string | null
          cliente_telefone?: string | null
          created_at?: string
          credits_consumed?: number
          data?: string
          duration_minutes?: number | null
          empresa_id?: string
          end_datetime?: string | null
          estado?: string
          execution_id?: string | null
          external_calendar_id?: string | null
          external_calendar_type?: string | null
          external_execution_state?: string
          hora?: string
          id?: string
          notas?: string | null
          resource_id?: string | null
          scheduling_state?: string
          service_id?: string | null
          start_datetime?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "agendamentos_agente_id_fkey"
            columns: ["agente_id"]
            isOneToOne: false
            referencedRelation: "agentes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agendamentos_chamada_id_fkey"
            columns: ["chamada_id"]
            isOneToOne: false
            referencedRelation: "chamadas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agendamentos_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agendamentos_resource_id_fkey"
            columns: ["resource_id"]
            isOneToOne: false
            referencedRelation: "scheduling_resources"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agendamentos_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "scheduling_services"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_action_logs: {
        Row: {
          action_data: Json | null
          action_type: string
          actor_type: string
          agent_id: string | null
          conversation_id: string | null
          created_at: string
          credits_consumed: number | null
          empresa_id: string
          execution_id: string | null
          id: string
          outcome: string
          outcome_message: string | null
          reference_id: string | null
        }
        Insert: {
          action_data?: Json | null
          action_type: string
          actor_type: string
          agent_id?: string | null
          conversation_id?: string | null
          created_at?: string
          credits_consumed?: number | null
          empresa_id: string
          execution_id?: string | null
          id?: string
          outcome: string
          outcome_message?: string | null
          reference_id?: string | null
        }
        Update: {
          action_data?: Json | null
          action_type?: string
          actor_type?: string
          agent_id?: string | null
          conversation_id?: string | null
          created_at?: string
          credits_consumed?: number | null
          empresa_id?: string
          execution_id?: string | null
          id?: string
          outcome?: string
          outcome_message?: string | null
          reference_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "agent_action_logs_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agentes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_action_logs_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_action_logs_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_knowledge_base: {
        Row: {
          agent_id: string | null
          content: string | null
          created_at: string
          empresa_id: string
          file_path: string | null
          id: string
          source_url: string | null
          status: string
          title: string
          type: Database["public"]["Enums"]["knowledge_type"]
        }
        Insert: {
          agent_id?: string | null
          content?: string | null
          created_at?: string
          empresa_id: string
          file_path?: string | null
          id?: string
          source_url?: string | null
          status?: string
          title: string
          type: Database["public"]["Enums"]["knowledge_type"]
        }
        Update: {
          agent_id?: string | null
          content?: string | null
          created_at?: string
          empresa_id?: string
          file_path?: string | null
          id?: string
          source_url?: string | null
          status?: string
          title?: string
          type?: Database["public"]["Enums"]["knowledge_type"]
        }
        Relationships: [
          {
            foreignKeyName: "agent_knowledge_base_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agentes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_knowledge_base_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_logs: {
        Row: {
          conversation_id: string | null
          created_at: string
          event_type: string
          id: string
          payload: Json
        }
        Insert: {
          conversation_id?: string | null
          created_at?: string
          event_type: string
          id?: string
          payload?: Json
        }
        Update: {
          conversation_id?: string | null
          created_at?: string
          event_type?: string
          id?: string
          payload?: Json
        }
        Relationships: [
          {
            foreignKeyName: "agent_logs_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_runtime_logs: {
        Row: {
          conversation_id: string | null
          created_at: string
          empresa_id: string | null
          event_type: string | null
          id: string
          message: string | null
          payload: Json | null
        }
        Insert: {
          conversation_id?: string | null
          created_at?: string
          empresa_id?: string | null
          event_type?: string | null
          id?: string
          message?: string | null
          payload?: Json | null
        }
        Update: {
          conversation_id?: string | null
          created_at?: string
          empresa_id?: string | null
          event_type?: string | null
          id?: string
          message?: string | null
          payload?: Json | null
        }
        Relationships: []
      }
      agentes: {
        Row: {
          contexto_negocio: string | null
          created_at: string
          deleted_at: string | null
          descricao_funcao: string | null
          empresa_id: string
          id: string
          idioma: string | null
          initial_greeting: string | null
          is_default_chat_agent: boolean
          nome: string
          personalidade: string | null
          prompt_base: string | null
          regras: string | null
          response_delay_ms: number | null
          response_style: string
          status: string
          welcome_message: string | null
        }
        Insert: {
          contexto_negocio?: string | null
          created_at?: string
          deleted_at?: string | null
          descricao_funcao?: string | null
          empresa_id: string
          id?: string
          idioma?: string | null
          initial_greeting?: string | null
          is_default_chat_agent?: boolean
          nome: string
          personalidade?: string | null
          prompt_base?: string | null
          regras?: string | null
          response_delay_ms?: number | null
          response_style?: string
          status?: string
          welcome_message?: string | null
        }
        Update: {
          contexto_negocio?: string | null
          created_at?: string
          deleted_at?: string | null
          descricao_funcao?: string | null
          empresa_id?: string
          id?: string
          idioma?: string | null
          initial_greeting?: string | null
          is_default_chat_agent?: boolean
          nome?: string
          personalidade?: string | null
          prompt_base?: string | null
          regras?: string | null
          response_delay_ms?: number | null
          response_style?: string
          status?: string
          welcome_message?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "agentes_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_providers: {
        Row: {
          api_key: string | null
          created_at: string
          id: string
          is_enabled: boolean
          last_tested_at: string | null
          provider_key: string
          provider_name: string
          status: string
          updated_at: string
        }
        Insert: {
          api_key?: string | null
          created_at?: string
          id?: string
          is_enabled?: boolean
          last_tested_at?: string | null
          provider_key: string
          provider_name: string
          status?: string
          updated_at?: string
        }
        Update: {
          api_key?: string | null
          created_at?: string
          id?: string
          is_enabled?: boolean
          last_tested_at?: string | null
          provider_key?: string
          provider_name?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      appointment_resources: {
        Row: {
          appointment_id: string
          created_at: string
          id: string
          resource_id: string
        }
        Insert: {
          appointment_id: string
          created_at?: string
          id?: string
          resource_id: string
        }
        Update: {
          appointment_id?: string
          created_at?: string
          id?: string
          resource_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "appointment_resources_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "agendamentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointment_resources_resource_id_fkey"
            columns: ["resource_id"]
            isOneToOne: false
            referencedRelation: "scheduling_resources"
            referencedColumns: ["id"]
          },
        ]
      }
      availability_logs: {
        Row: {
          created_at: string
          empresa_id: string
          execution_time_ms: number | null
          id: string
          requested_by: string | null
          requested_date_from: string
          requested_date_to: string
          requested_duration_minutes: number
          resource_ids: string[] | null
          slots_returned: number
        }
        Insert: {
          created_at?: string
          empresa_id: string
          execution_time_ms?: number | null
          id?: string
          requested_by?: string | null
          requested_date_from: string
          requested_date_to: string
          requested_duration_minutes: number
          resource_ids?: string[] | null
          slots_returned?: number
        }
        Update: {
          created_at?: string
          empresa_id?: string
          execution_time_ms?: number | null
          id?: string
          requested_by?: string | null
          requested_date_from?: string
          requested_date_to?: string
          requested_duration_minutes?: number
          resource_ids?: string[] | null
          slots_returned?: number
        }
        Relationships: [
          {
            foreignKeyName: "availability_logs_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
        ]
      }
      booking_configuration: {
        Row: {
          allow_external_calendar: boolean
          allow_internal_calendar: boolean
          allow_outside_business_hours: boolean
          allow_same_day_booking: boolean
          created_at: string
          empresa_id: string
          fallback_service_id: string | null
          id: string
          minimum_advance_minutes: number
          require_email: boolean
          require_name: boolean
          require_phone: boolean
          require_reason: boolean
          updated_at: string
        }
        Insert: {
          allow_external_calendar?: boolean
          allow_internal_calendar?: boolean
          allow_outside_business_hours?: boolean
          allow_same_day_booking?: boolean
          created_at?: string
          empresa_id: string
          fallback_service_id?: string | null
          id?: string
          minimum_advance_minutes?: number
          require_email?: boolean
          require_name?: boolean
          require_phone?: boolean
          require_reason?: boolean
          updated_at?: string
        }
        Update: {
          allow_external_calendar?: boolean
          allow_internal_calendar?: boolean
          allow_outside_business_hours?: boolean
          allow_same_day_booking?: boolean
          created_at?: string
          empresa_id?: string
          fallback_service_id?: string | null
          id?: string
          minimum_advance_minutes?: number
          require_email?: boolean
          require_name?: boolean
          require_phone?: boolean
          require_reason?: boolean
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "booking_configuration_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: true
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_configuration_fallback_service_id_fkey"
            columns: ["fallback_service_id"]
            isOneToOne: false
            referencedRelation: "scheduling_services"
            referencedColumns: ["id"]
          },
        ]
      }
      booking_lifecycle: {
        Row: {
          conversation_id: string
          created_at: string
          current_state: Database["public"]["Enums"]["booking_lifecycle_state"]
          customer_email: string | null
          customer_name: string | null
          customer_phone: string | null
          empresa_id: string
          failure_reason: string | null
          id: string
          metadata: Json
          selected_slot: string | null
          service_id: string | null
          updated_at: string
        }
        Insert: {
          conversation_id: string
          created_at?: string
          current_state?: Database["public"]["Enums"]["booking_lifecycle_state"]
          customer_email?: string | null
          customer_name?: string | null
          customer_phone?: string | null
          empresa_id: string
          failure_reason?: string | null
          id?: string
          metadata?: Json
          selected_slot?: string | null
          service_id?: string | null
          updated_at?: string
        }
        Update: {
          conversation_id?: string
          created_at?: string
          current_state?: Database["public"]["Enums"]["booking_lifecycle_state"]
          customer_email?: string | null
          customer_name?: string | null
          customer_phone?: string | null
          empresa_id?: string
          failure_reason?: string | null
          id?: string
          metadata?: Json
          selected_slot?: string | null
          service_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "booking_lifecycle_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_lifecycle_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_lifecycle_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "scheduling_services"
            referencedColumns: ["id"]
          },
        ]
      }
      booking_lifecycle_log: {
        Row: {
          created_at: string
          error_code: string | null
          event_type: Database["public"]["Enums"]["booking_event_type"]
          execution_id: string
          id: string
          latency_ms: number | null
          lifecycle_id: string
          metadata: Json | null
          next_state: Database["public"]["Enums"]["booking_lifecycle_state"]
          previous_state: Database["public"]["Enums"]["booking_lifecycle_state"]
          success: boolean
        }
        Insert: {
          created_at?: string
          error_code?: string | null
          event_type: Database["public"]["Enums"]["booking_event_type"]
          execution_id: string
          id?: string
          latency_ms?: number | null
          lifecycle_id: string
          metadata?: Json | null
          next_state: Database["public"]["Enums"]["booking_lifecycle_state"]
          previous_state: Database["public"]["Enums"]["booking_lifecycle_state"]
          success?: boolean
        }
        Update: {
          created_at?: string
          error_code?: string | null
          event_type?: Database["public"]["Enums"]["booking_event_type"]
          execution_id?: string
          id?: string
          latency_ms?: number | null
          lifecycle_id?: string
          metadata?: Json | null
          next_state?: Database["public"]["Enums"]["booking_lifecycle_state"]
          previous_state?: Database["public"]["Enums"]["booking_lifecycle_state"]
          success?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "booking_lifecycle_log_lifecycle_id_fkey"
            columns: ["lifecycle_id"]
            isOneToOne: false
            referencedRelation: "booking_lifecycle"
            referencedColumns: ["id"]
          },
        ]
      }
      chamadas: {
        Row: {
          agente_id: string | null
          created_at: string
          data_hora_inicio: string
          deleted_at: string | null
          duracao: number | null
          empresa_id: string
          id: string
          intencao_detetada: string | null
          proxima_acao: string | null
          resultado: string | null
          status: string
          telefone_cliente: string
        }
        Insert: {
          agente_id?: string | null
          created_at?: string
          data_hora_inicio?: string
          deleted_at?: string | null
          duracao?: number | null
          empresa_id: string
          id?: string
          intencao_detetada?: string | null
          proxima_acao?: string | null
          resultado?: string | null
          status?: string
          telefone_cliente: string
        }
        Update: {
          agente_id?: string | null
          created_at?: string
          data_hora_inicio?: string
          deleted_at?: string | null
          duracao?: number | null
          empresa_id?: string
          id?: string
          intencao_detetada?: string | null
          proxima_acao?: string | null
          resultado?: string | null
          status?: string
          telefone_cliente?: string
        }
        Relationships: [
          {
            foreignKeyName: "chamadas_agente_id_fkey"
            columns: ["agente_id"]
            isOneToOne: false
            referencedRelation: "agentes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chamadas_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
        ]
      }
      conversations: {
        Row: {
          assigned_user_id: string | null
          channel: Database["public"]["Enums"]["conversation_channel"]
          client_identifier: string
          client_name: string | null
          closed_at: string | null
          closed_by: string | null
          closure_note: string | null
          closure_reason: string | null
          consecutive_error_count: number | null
          context_version: number | null
          conversation_context: Json
          conversation_state: string
          created_at: string
          customer_id: string | null
          deleted_at: string | null
          empresa_id: string
          id: string
          last_message_at: string
          main_intent: string | null
          next_action: string | null
          owner: Database["public"]["Enums"]["conversation_owner"]
          result: string | null
          status: Database["public"]["Enums"]["conversation_status"]
          summary: string | null
        }
        Insert: {
          assigned_user_id?: string | null
          channel?: Database["public"]["Enums"]["conversation_channel"]
          client_identifier: string
          client_name?: string | null
          closed_at?: string | null
          closed_by?: string | null
          closure_note?: string | null
          closure_reason?: string | null
          consecutive_error_count?: number | null
          context_version?: number | null
          conversation_context?: Json
          conversation_state?: string
          created_at?: string
          customer_id?: string | null
          deleted_at?: string | null
          empresa_id: string
          id?: string
          last_message_at?: string
          main_intent?: string | null
          next_action?: string | null
          owner?: Database["public"]["Enums"]["conversation_owner"]
          result?: string | null
          status?: Database["public"]["Enums"]["conversation_status"]
          summary?: string | null
        }
        Update: {
          assigned_user_id?: string | null
          channel?: Database["public"]["Enums"]["conversation_channel"]
          client_identifier?: string
          client_name?: string | null
          closed_at?: string | null
          closed_by?: string | null
          closure_note?: string | null
          closure_reason?: string | null
          consecutive_error_count?: number | null
          context_version?: number | null
          conversation_context?: Json
          conversation_state?: string
          created_at?: string
          customer_id?: string | null
          deleted_at?: string | null
          empresa_id?: string
          id?: string
          last_message_at?: string
          main_intent?: string | null
          next_action?: string | null
          owner?: Database["public"]["Enums"]["conversation_owner"]
          result?: string | null
          status?: Database["public"]["Enums"]["conversation_status"]
          summary?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "conversations_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
        ]
      }
      credit_notifications: {
        Row: {
          created_at: string
          credits_limit_at_notification: number
          credits_used_at_notification: number
          empresa_id: string
          id: string
          month: string
          notification_type: string
          notified_admin_at: string | null
          notified_company_at: string | null
          threshold_percentage: number
        }
        Insert: {
          created_at?: string
          credits_limit_at_notification: number
          credits_used_at_notification: number
          empresa_id: string
          id?: string
          month: string
          notification_type: string
          notified_admin_at?: string | null
          notified_company_at?: string | null
          threshold_percentage: number
        }
        Update: {
          created_at?: string
          credits_limit_at_notification?: number
          credits_used_at_notification?: number
          empresa_id?: string
          id?: string
          month?: string
          notification_type?: string
          notified_admin_at?: string | null
          notified_company_at?: string | null
          threshold_percentage?: number
        }
        Relationships: [
          {
            foreignKeyName: "credit_notifications_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
        ]
      }
      credit_packages: {
        Row: {
          added_by: string | null
          created_at: string
          credits_amount: number
          empresa_id: string
          id: string
          month: string
          notes: string | null
          package_type: string
        }
        Insert: {
          added_by?: string | null
          created_at?: string
          credits_amount: number
          empresa_id: string
          id?: string
          month: string
          notes?: string | null
          package_type: string
        }
        Update: {
          added_by?: string | null
          created_at?: string
          credits_amount?: number
          empresa_id?: string
          id?: string
          month?: string
          notes?: string | null
          package_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "credit_packages_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
        ]
      }
      credits_events: {
        Row: {
          created_at: string
          credits_consumed: number
          empresa_id: string
          event_type: Database["public"]["Enums"]["credit_event_type"]
          id: string
          metadata: Json | null
          reference_id: string | null
        }
        Insert: {
          created_at?: string
          credits_consumed?: number
          empresa_id: string
          event_type: Database["public"]["Enums"]["credit_event_type"]
          id?: string
          metadata?: Json | null
          reference_id?: string | null
        }
        Update: {
          created_at?: string
          credits_consumed?: number
          empresa_id?: string
          event_type?: Database["public"]["Enums"]["credit_event_type"]
          id?: string
          metadata?: Json | null
          reference_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "credits_events_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
        ]
      }
      credits_usage: {
        Row: {
          created_at: string
          credits_limit: number
          credits_used: number
          empresa_id: string
          extra_credits: number
          id: string
          month: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          credits_limit?: number
          credits_used?: number
          empresa_id: string
          extra_credits?: number
          id?: string
          month: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          credits_limit?: number
          credits_used?: number
          empresa_id?: string
          extra_credits?: number
          id?: string
          month?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "credits_usage_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_identifiers: {
        Row: {
          created_at: string
          customer_id: string
          id: string
          type: string
          value: string
        }
        Insert: {
          created_at?: string
          customer_id: string
          id?: string
          type: string
          value: string
        }
        Update: {
          created_at?: string
          customer_id?: string
          id?: string
          type?: string
          value?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_identifiers_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      customers: {
        Row: {
          created_at: string
          email: string | null
          empresa_id: string
          id: string
          last_seen_at: string
          name: string | null
          phone: string | null
        }
        Insert: {
          created_at?: string
          email?: string | null
          empresa_id: string
          id?: string
          last_seen_at?: string
          name?: string | null
          phone?: string | null
        }
        Update: {
          created_at?: string
          email?: string | null
          empresa_id?: string
          id?: string
          last_seen_at?: string
          name?: string | null
          phone?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "customers_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
        ]
      }
      email_logs: {
        Row: {
          body: string
          chamada_id: string | null
          created_at: string
          empresa_id: string
          error_message: string | null
          id: string
          recipient_email: string
          sent_at: string | null
          status: string
          subject: string
          template_id: string | null
        }
        Insert: {
          body: string
          chamada_id?: string | null
          created_at?: string
          empresa_id: string
          error_message?: string | null
          id?: string
          recipient_email: string
          sent_at?: string | null
          status?: string
          subject: string
          template_id?: string | null
        }
        Update: {
          body?: string
          chamada_id?: string | null
          created_at?: string
          empresa_id?: string
          error_message?: string | null
          id?: string
          recipient_email?: string
          sent_at?: string | null
          status?: string
          subject?: string
          template_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "email_logs_chamada_id_fkey"
            columns: ["chamada_id"]
            isOneToOne: false
            referencedRelation: "chamadas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_logs_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_logs_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "email_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      email_templates: {
        Row: {
          body: string
          created_at: string
          empresa_id: string
          id: string
          intent: string
          is_active: boolean
          recipient_type: string
          subject: string
          updated_at: string
        }
        Insert: {
          body: string
          created_at?: string
          empresa_id: string
          id?: string
          intent: string
          is_active?: boolean
          recipient_type?: string
          subject: string
          updated_at?: string
        }
        Update: {
          body?: string
          created_at?: string
          empresa_id?: string
          id?: string
          intent?: string
          is_active?: boolean
          recipient_type?: string
          subject?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_templates_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
        ]
      }
      empresas: {
        Row: {
          chat_ai_model: string | null
          chat_ai_provider: string | null
          chat_ai_real_enabled: boolean
          created_at: string
          default_response_delay_ms: number | null
          default_welcome_message: string | null
          deleted_at: string | null
          email: string | null
          fuso_horario: string | null
          horario_funcionamento: string | null
          id: string
          is_test_environment: boolean
          monthly_price: number | null
          nome: string
          pricing_enabled: boolean
          service_chat_enabled: boolean
          service_email_enabled: boolean
          service_scheduling_enabled: boolean
          service_voice_enabled: boolean
          slot_increment_minutes: number | null
          slug: string | null
          status: string
          subscription_plan_id: string | null
          telefone: string | null
          widget_agent_message_color: string | null
          widget_agent_text_color: string | null
          widget_avatar_url: string | null
          widget_background_color: string | null
          widget_border_radius: string | null
          widget_button_color: string | null
          widget_header_text: string | null
          widget_input_background_color: string | null
          widget_input_text_color: string | null
          widget_primary_color: string | null
          widget_secondary_color: string | null
          widget_size: string | null
          widget_theme_mode: string | null
          widget_user_message_color: string | null
          widget_user_text_color: string | null
        }
        Insert: {
          chat_ai_model?: string | null
          chat_ai_provider?: string | null
          chat_ai_real_enabled?: boolean
          created_at?: string
          default_response_delay_ms?: number | null
          default_welcome_message?: string | null
          deleted_at?: string | null
          email?: string | null
          fuso_horario?: string | null
          horario_funcionamento?: string | null
          id?: string
          is_test_environment?: boolean
          monthly_price?: number | null
          nome: string
          pricing_enabled?: boolean
          service_chat_enabled?: boolean
          service_email_enabled?: boolean
          service_scheduling_enabled?: boolean
          service_voice_enabled?: boolean
          slot_increment_minutes?: number | null
          slug?: string | null
          status?: string
          subscription_plan_id?: string | null
          telefone?: string | null
          widget_agent_message_color?: string | null
          widget_agent_text_color?: string | null
          widget_avatar_url?: string | null
          widget_background_color?: string | null
          widget_border_radius?: string | null
          widget_button_color?: string | null
          widget_header_text?: string | null
          widget_input_background_color?: string | null
          widget_input_text_color?: string | null
          widget_primary_color?: string | null
          widget_secondary_color?: string | null
          widget_size?: string | null
          widget_theme_mode?: string | null
          widget_user_message_color?: string | null
          widget_user_text_color?: string | null
        }
        Update: {
          chat_ai_model?: string | null
          chat_ai_provider?: string | null
          chat_ai_real_enabled?: boolean
          created_at?: string
          default_response_delay_ms?: number | null
          default_welcome_message?: string | null
          deleted_at?: string | null
          email?: string | null
          fuso_horario?: string | null
          horario_funcionamento?: string | null
          id?: string
          is_test_environment?: boolean
          monthly_price?: number | null
          nome?: string
          pricing_enabled?: boolean
          service_chat_enabled?: boolean
          service_email_enabled?: boolean
          service_scheduling_enabled?: boolean
          service_voice_enabled?: boolean
          slot_increment_minutes?: number | null
          slug?: string | null
          status?: string
          subscription_plan_id?: string | null
          telefone?: string | null
          widget_agent_message_color?: string | null
          widget_agent_text_color?: string | null
          widget_avatar_url?: string | null
          widget_background_color?: string | null
          widget_border_radius?: string | null
          widget_button_color?: string | null
          widget_header_text?: string | null
          widget_input_background_color?: string | null
          widget_input_text_color?: string | null
          widget_primary_color?: string | null
          widget_secondary_color?: string | null
          widget_size?: string | null
          widget_theme_mode?: string | null
          widget_user_message_color?: string | null
          widget_user_text_color?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "empresas_subscription_plan_id_fkey"
            columns: ["subscription_plan_id"]
            isOneToOne: false
            referencedRelation: "subscription_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      external_data_sources: {
        Row: {
          created_at: string
          empresa_id: string
          id: string
          is_active: boolean
          linked_at: string
          linked_by: string | null
          metadata: Json | null
          source_identifier: string | null
          source_name: string
          source_type: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          empresa_id: string
          id?: string
          is_active?: boolean
          linked_at?: string
          linked_by?: string | null
          metadata?: Json | null
          source_identifier?: string | null
          source_name: string
          source_type: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          empresa_id?: string
          id?: string
          is_active?: boolean
          linked_at?: string
          linked_by?: string | null
          metadata?: Json | null
          source_identifier?: string | null
          source_name?: string
          source_type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "external_data_sources_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
        ]
      }
      follow_up_rules: {
        Row: {
          client_template_id: string | null
          company_notification_email: string | null
          company_template_id: string | null
          create_appointment: boolean
          created_at: string
          empresa_id: string
          id: string
          intent: string
          is_active: boolean
          mark_manual_followup: boolean
          register_only: boolean
          send_email_client: boolean
          send_email_company: boolean
          updated_at: string
        }
        Insert: {
          client_template_id?: string | null
          company_notification_email?: string | null
          company_template_id?: string | null
          create_appointment?: boolean
          created_at?: string
          empresa_id: string
          id?: string
          intent: string
          is_active?: boolean
          mark_manual_followup?: boolean
          register_only?: boolean
          send_email_client?: boolean
          send_email_company?: boolean
          updated_at?: string
        }
        Update: {
          client_template_id?: string | null
          company_notification_email?: string | null
          company_template_id?: string | null
          create_appointment?: boolean
          created_at?: string
          empresa_id?: string
          id?: string
          intent?: string
          is_active?: boolean
          mark_manual_followup?: boolean
          register_only?: boolean
          send_email_client?: boolean
          send_email_company?: boolean
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "follow_up_rules_client_template_id_fkey"
            columns: ["client_template_id"]
            isOneToOne: false
            referencedRelation: "email_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "follow_up_rules_company_template_id_fkey"
            columns: ["company_template_id"]
            isOneToOne: false
            referencedRelation: "email_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "follow_up_rules_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
        ]
      }
      leads: {
        Row: {
          agent_id: string | null
          conversation_id: string | null
          created_at: string
          email: string | null
          empresa_id: string
          id: string
          name: string | null
          notes: string | null
          phone: string | null
          source: string | null
          status: string
          updated_at: string
        }
        Insert: {
          agent_id?: string | null
          conversation_id?: string | null
          created_at?: string
          email?: string | null
          empresa_id: string
          id?: string
          name?: string | null
          notes?: string | null
          phone?: string | null
          source?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          agent_id?: string | null
          conversation_id?: string | null
          created_at?: string
          email?: string | null
          empresa_id?: string
          id?: string
          name?: string | null
          notes?: string | null
          phone?: string | null
          source?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "leads_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agentes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          content: string
          conversation_id: string
          created_at: string
          id: string
          is_internal: boolean
          sender_type: Database["public"]["Enums"]["message_sender_type"]
          sender_user_id: string | null
        }
        Insert: {
          content: string
          conversation_id: string
          created_at?: string
          id?: string
          is_internal?: boolean
          sender_type: Database["public"]["Enums"]["message_sender_type"]
          sender_user_id?: string | null
        }
        Update: {
          content?: string
          conversation_id?: string
          created_at?: string
          id?: string
          is_internal?: boolean
          sender_type?: Database["public"]["Enums"]["message_sender_type"]
          sender_user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          deleted_at: string | null
          email: string
          empresa_id: string | null
          id: string
          last_seen_at: string | null
          nome: string
          status: string
          user_id: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          email: string
          empresa_id?: string | null
          id?: string
          last_seen_at?: string | null
          nome: string
          status?: string
          user_id: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          email?: string
          empresa_id?: string | null
          id?: string
          last_seen_at?: string | null
          nome?: string
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
        ]
      }
      scheduling_business_hours: {
        Row: {
          day_of_week: number
          empresa_id: string
          end_time: string
          id: string
          is_closed: boolean
          start_time: string
        }
        Insert: {
          day_of_week: number
          empresa_id: string
          end_time: string
          id?: string
          is_closed?: boolean
          start_time: string
        }
        Update: {
          day_of_week?: number
          empresa_id?: string
          end_time?: string
          id?: string
          is_closed?: boolean
          start_time?: string
        }
        Relationships: [
          {
            foreignKeyName: "scheduling_business_hours_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
        ]
      }
      scheduling_capabilities: {
        Row: {
          allow_cancel_appointment: boolean
          allow_create_appointment: boolean
          allow_reschedule_appointment: boolean
          allow_view_availability: boolean
          created_at: string
          empresa_id: string
          id: string
          updated_at: string
        }
        Insert: {
          allow_cancel_appointment?: boolean
          allow_create_appointment?: boolean
          allow_reschedule_appointment?: boolean
          allow_view_availability?: boolean
          created_at?: string
          empresa_id: string
          id?: string
          updated_at?: string
        }
        Update: {
          allow_cancel_appointment?: boolean
          allow_create_appointment?: boolean
          allow_reschedule_appointment?: boolean
          allow_view_availability?: boolean
          created_at?: string
          empresa_id?: string
          id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "scheduling_capabilities_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: true
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
        ]
      }
      scheduling_resources: {
        Row: {
          calendar_type: string | null
          capacity: number
          color: string | null
          created_at: string
          default_appointment_duration_minutes: number
          empresa_id: string
          external_calendar_id: string | null
          id: string
          metadata: Json | null
          name: string
          priority: number
          status: string
          type: string
          updated_at: string
        }
        Insert: {
          calendar_type?: string | null
          capacity?: number
          color?: string | null
          created_at?: string
          default_appointment_duration_minutes?: number
          empresa_id: string
          external_calendar_id?: string | null
          id?: string
          metadata?: Json | null
          name: string
          priority?: number
          status?: string
          type?: string
          updated_at?: string
        }
        Update: {
          calendar_type?: string | null
          capacity?: number
          color?: string | null
          created_at?: string
          default_appointment_duration_minutes?: number
          empresa_id?: string
          external_calendar_id?: string | null
          id?: string
          metadata?: Json | null
          name?: string
          priority?: number
          status?: string
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "scheduling_resources_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
        ]
      }
      scheduling_service_resources: {
        Row: {
          id: string
          is_required: boolean
          resource_id: string
          service_id: string
        }
        Insert: {
          id?: string
          is_required?: boolean
          resource_id: string
          service_id: string
        }
        Update: {
          id?: string
          is_required?: boolean
          resource_id?: string
          service_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "scheduling_service_resources_resource_id_fkey"
            columns: ["resource_id"]
            isOneToOne: false
            referencedRelation: "scheduling_resources"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scheduling_service_resources_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "scheduling_services"
            referencedColumns: ["id"]
          },
        ]
      }
      scheduling_services: {
        Row: {
          bookable: boolean
          buffer_after_minutes: number
          buffer_before_minutes: number
          created_at: string
          currency: string | null
          description: string | null
          duration_minutes: number | null
          empresa_id: string
          id: string
          name: string
          price: number | null
          priority: number
          promo_end: string | null
          promo_price: number | null
          promo_start: string | null
          requires_reason: boolean | null
          show_in_chat_menu: boolean
          status: string
          updated_at: string
        }
        Insert: {
          bookable?: boolean
          buffer_after_minutes?: number
          buffer_before_minutes?: number
          created_at?: string
          currency?: string | null
          description?: string | null
          duration_minutes?: number | null
          empresa_id: string
          id?: string
          name: string
          price?: number | null
          priority?: number
          promo_end?: string | null
          promo_price?: number | null
          promo_start?: string | null
          requires_reason?: boolean | null
          show_in_chat_menu?: boolean
          status?: string
          updated_at?: string
        }
        Update: {
          bookable?: boolean
          buffer_after_minutes?: number
          buffer_before_minutes?: number
          created_at?: string
          currency?: string | null
          description?: string | null
          duration_minutes?: number | null
          empresa_id?: string
          id?: string
          name?: string
          price?: number | null
          priority?: number
          promo_end?: string | null
          promo_price?: number | null
          promo_start?: string | null
          requires_reason?: boolean | null
          show_in_chat_menu?: boolean
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "scheduling_services_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
        ]
      }
      settings: {
        Row: {
          created_at: string
          empresa_id: string | null
          id: string
          key: string
          scope: Database["public"]["Enums"]["settings_scope"]
          updated_at: string
          value: Json
        }
        Insert: {
          created_at?: string
          empresa_id?: string | null
          id?: string
          key: string
          scope?: Database["public"]["Enums"]["settings_scope"]
          updated_at?: string
          value?: Json
        }
        Update: {
          created_at?: string
          empresa_id?: string | null
          id?: string
          key?: string
          scope?: Database["public"]["Enums"]["settings_scope"]
          updated_at?: string
          value?: Json
        }
        Relationships: [
          {
            foreignKeyName: "settings_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
        ]
      }
      subscription_plans: {
        Row: {
          alert_threshold_critical: number
          alert_threshold_soft: number
          alert_threshold_warning: number
          created_at: string
          description: string | null
          external_data_source_limit: number
          id: string
          is_active: boolean
          monthly_credit_envelope: number
          name: string
          updated_at: string
          voice_quality_profile: string
        }
        Insert: {
          alert_threshold_critical?: number
          alert_threshold_soft?: number
          alert_threshold_warning?: number
          created_at?: string
          description?: string | null
          external_data_source_limit?: number
          id?: string
          is_active?: boolean
          monthly_credit_envelope?: number
          name: string
          updated_at?: string
          voice_quality_profile?: string
        }
        Update: {
          alert_threshold_critical?: number
          alert_threshold_soft?: number
          alert_threshold_warning?: number
          created_at?: string
          description?: string | null
          external_data_source_limit?: number
          id?: string
          is_active?: boolean
          monthly_credit_envelope?: number
          name?: string
          updated_at?: string
          voice_quality_profile?: string
        }
        Relationships: []
      }
      system_email_logs: {
        Row: {
          alert_type: string
          body: string
          created_at: string
          empresa_id: string | null
          error_message: string | null
          id: string
          metadata: Json | null
          month: string
          recipients: string[]
          sent_at: string | null
          status: string
          subject: string
        }
        Insert: {
          alert_type: string
          body: string
          created_at?: string
          empresa_id?: string | null
          error_message?: string | null
          id?: string
          metadata?: Json | null
          month: string
          recipients: string[]
          sent_at?: string | null
          status?: string
          subject: string
        }
        Update: {
          alert_type?: string
          body?: string
          created_at?: string
          empresa_id?: string | null
          error_message?: string | null
          id?: string
          metadata?: Json | null
          month?: string
          recipients?: string[]
          sent_at?: string | null
          status?: string
          subject?: string
        }
        Relationships: [
          {
            foreignKeyName: "system_email_logs_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
        ]
      }
      system_email_templates: {
        Row: {
          body_html: string
          body_text: string
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          name: string
          subject: string
          template_key: string
          updated_at: string
          variables: string[]
        }
        Insert: {
          body_html: string
          body_text: string
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
          subject: string
          template_key: string
          updated_at?: string
          variables?: string[]
        }
        Update: {
          body_html?: string
          body_text?: string
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
          subject?: string
          template_key?: string
          updated_at?: string
          variables?: string[]
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      check_duplicate_appointments: {
        Args: never
        Returns: {
          count: number
          empresa_id: string
          start_datetime: string
        }[]
      }
      get_ai_providers_safe: {
        Args: never
        Returns: {
          created_at: string
          has_api_key: boolean
          id: string
          is_enabled: boolean
          last_tested_at: string
          provider_key: string
          provider_name: string
          status: string
          updated_at: string
        }[]
      }
      get_client_identifier: { Args: never; Returns: string }
      get_current_user_role: { Args: never; Returns: string }
      get_public_empresa_info: {
        Args: { _slug: string }
        Returns: {
          default_response_delay_ms: number
          default_welcome_message: string
          id: string
          nome: string
          service_chat_enabled: boolean
          service_email_enabled: boolean
          service_scheduling_enabled: boolean
          service_voice_enabled: boolean
          slug: string
          widget_agent_message_color: string
          widget_agent_text_color: string
          widget_avatar_url: string
          widget_background_color: string
          widget_border_radius: string
          widget_button_color: string
          widget_header_text: string
          widget_input_background_color: string
          widget_input_text_color: string
          widget_primary_color: string
          widget_secondary_color: string
          widget_size: string
          widget_theme_mode: string
          widget_user_message_color: string
          widget_user_text_color: string
        }[]
      }
      get_user_empresa_id: { Args: { _user_id: string }; Returns: string }
      get_user_role: { Args: { user_id_input: string }; Returns: string }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_coordinator: { Args: { _user_id: string }; Returns: boolean }
      set_client_identifier: {
        Args: { identifier: string }
        Returns: undefined
      }
    }
    Enums: {
      app_role: "admin" | "cliente" | "cliente_coordenador" | "cliente_normal"
      booking_event_type:
        | "conversation_started"
        | "data_collected"
        | "service_matched"
        | "availability_requested"
        | "slots_suggested"
        | "slot_selected"
        | "customer_data_collected"
        | "confirmation_requested"
        | "user_confirmed"
        | "booking_committed"
        | "slot_conflict"
        | "user_cancelled"
        | "timeout_expired"
        | "system_error"
      booking_lifecycle_state:
        | "initiated"
        | "collecting_data"
        | "service_resolved"
        | "availability_checked"
        | "slot_selected"
        | "awaiting_confirmation"
        | "confirmed"
        | "failed"
        | "cancelled"
      conversation_channel: "chat" | "whatsapp" | "voice"
      conversation_owner: "ai" | "human"
      conversation_status:
        | "ai_active"
        | "waiting_human"
        | "human_active"
        | "closed"
        | "completed"
      credit_event_type:
        | "call_completed"
        | "call_short"
        | "agent_test"
        | "message"
        | "email"
        | "knowledge"
        | "other"
      knowledge_type: "faq" | "document" | "website" | "notes"
      message_sender_type: "client" | "ai" | "human" | "system"
      settings_scope: "global" | "empresa"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "cliente", "cliente_coordenador", "cliente_normal"],
      booking_event_type: [
        "conversation_started",
        "data_collected",
        "service_matched",
        "availability_requested",
        "slots_suggested",
        "slot_selected",
        "customer_data_collected",
        "confirmation_requested",
        "user_confirmed",
        "booking_committed",
        "slot_conflict",
        "user_cancelled",
        "timeout_expired",
        "system_error",
      ],
      booking_lifecycle_state: [
        "initiated",
        "collecting_data",
        "service_resolved",
        "availability_checked",
        "slot_selected",
        "awaiting_confirmation",
        "confirmed",
        "failed",
        "cancelled",
      ],
      conversation_channel: ["chat", "whatsapp", "voice"],
      conversation_owner: ["ai", "human"],
      conversation_status: [
        "ai_active",
        "waiting_human",
        "human_active",
        "closed",
        "completed",
      ],
      credit_event_type: [
        "call_completed",
        "call_short",
        "agent_test",
        "message",
        "email",
        "knowledge",
        "other",
      ],
      knowledge_type: ["faq", "document", "website", "notes"],
      message_sender_type: ["client", "ai", "human", "system"],
      settings_scope: ["global", "empresa"],
    },
  },
} as const
