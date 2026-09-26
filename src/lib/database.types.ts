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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      admin_login_attempts: {
        Row: {
          created_at: string
          id: number
          ip: string | null
          ok: boolean
        }
        Insert: {
          created_at?: string
          id?: never
          ip?: string | null
          ok: boolean
        }
        Update: {
          created_at?: string
          id?: never
          ip?: string | null
          ok?: boolean
        }
        Relationships: []
      }
      app_settings: {
        Row: {
          admin_emails: string[]
          consent_version: string
          id: boolean
          messaging_terms_version: string
          require_tutor_approval: boolean
          terms_version: string
          tutor_agreement_version: string
          updated_at: string
        }
        Insert: {
          admin_emails?: string[]
          consent_version?: string
          id?: boolean
          messaging_terms_version?: string
          require_tutor_approval?: boolean
          terms_version?: string
          tutor_agreement_version?: string
          updated_at?: string
        }
        Update: {
          admin_emails?: string[]
          consent_version?: string
          id?: boolean
          messaging_terms_version?: string
          require_tutor_approval?: boolean
          terms_version?: string
          tutor_agreement_version?: string
          updated_at?: string
        }
        Relationships: []
      }
      audit_log: {
        Row: {
          action: string
          actor_id: string | null
          created_at: string
          data: Json
          id: number
          target_id: string | null
          target_type: string
        }
        Insert: {
          action: string
          actor_id?: string | null
          created_at?: string
          data?: Json
          id?: never
          target_id?: string | null
          target_type: string
        }
        Update: {
          action?: string
          actor_id?: string | null
          created_at?: string
          data?: Json
          id?: never
          target_id?: string | null
          target_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "audit_log_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      consents: {
        Row: {
          ack_free_no_payment: boolean
          ack_incident_process: boolean
          ack_messaging_monitoring: boolean
          ack_no_recording: boolean
          ack_online_only: boolean
          ack_reachable: boolean
          family_id: string
          guardian_name: string
          guardian_phone: string
          guardian_relationship: string
          id: string
          revoked_at: string | null
          signature: string
          signed_at: string
          student_id: string
          user_agent: string | null
          version: string
        }
        Insert: {
          ack_free_no_payment: boolean
          ack_incident_process: boolean
          ack_messaging_monitoring: boolean
          ack_no_recording: boolean
          ack_online_only: boolean
          ack_reachable: boolean
          family_id: string
          guardian_name: string
          guardian_phone: string
          guardian_relationship: string
          id?: string
          revoked_at?: string | null
          signature: string
          signed_at?: string
          student_id: string
          user_agent?: string | null
          version: string
        }
        Update: {
          ack_free_no_payment?: boolean
          ack_incident_process?: boolean
          ack_messaging_monitoring?: boolean
          ack_no_recording?: boolean
          ack_online_only?: boolean
          ack_reachable?: boolean
          family_id?: string
          guardian_name?: string
          guardian_phone?: string
          guardian_relationship?: string
          id?: string
          revoked_at?: string | null
          signature?: string
          signed_at?: string
          student_id?: string
          user_agent?: string | null
          version?: string
        }
        Relationships: [
          {
            foreignKeyName: "consents_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "consents_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      email_code_sends: {
        Row: {
          created_at: string
          email: string
          id: number
          ip: string | null
        }
        Insert: {
          created_at?: string
          email: string
          id?: never
          ip?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          id?: never
          ip?: string | null
        }
        Relationships: []
      }
      email_codes: {
        Row: {
          attempts: number
          code_hash: string
          created_at: string
          email: string
          expires_at: string
          purpose: string
        }
        Insert: {
          attempts?: number
          code_hash: string
          created_at?: string
          email: string
          expires_at: string
          purpose: string
        }
        Update: {
          attempts?: number
          code_hash?: string
          created_at?: string
          email?: string
          expires_at?: string
          purpose?: string
        }
        Relationships: []
      }
      email_outbox: {
        Row: {
          attempts: number
          created_at: string
          dedupe_key: string | null
          id: number
          last_error: string | null
          locked_at: string | null
          payload: Json
          send_after: string
          sent_at: string | null
          status: Database["public"]["Enums"]["outbox_status"]
          template: string
          to_email: string
          to_name: string | null
        }
        Insert: {
          attempts?: number
          created_at?: string
          dedupe_key?: string | null
          id?: never
          last_error?: string | null
          locked_at?: string | null
          payload?: Json
          send_after?: string
          sent_at?: string | null
          status?: Database["public"]["Enums"]["outbox_status"]
          template: string
          to_email: string
          to_name?: string | null
        }
        Update: {
          attempts?: number
          created_at?: string
          dedupe_key?: string | null
          id?: never
          last_error?: string | null
          locked_at?: string | null
          payload?: Json
          send_after?: string
          sent_at?: string | null
          status?: Database["public"]["Enums"]["outbox_status"]
          template?: string
          to_email?: string
          to_name?: string | null
        }
        Relationships: []
      }
      guardians: {
        Row: {
          account_id: string
          created_at: string
          email: string
          id: string
          invite_count: number
          last_invited_at: string
          last_viewed_at: string | null
          name: string
          student_id: string
          token_expires_at: string
          token_hash: string
          updated_at: string
        }
        Insert: {
          account_id: string
          created_at?: string
          email: string
          id?: string
          invite_count?: number
          last_invited_at?: string
          last_viewed_at?: string | null
          name: string
          student_id: string
          token_expires_at: string
          token_hash: string
          updated_at?: string
        }
        Update: {
          account_id?: string
          created_at?: string
          email?: string
          id?: string
          invite_count?: number
          last_invited_at?: string
          last_viewed_at?: string | null
          name?: string
          student_id?: string
          token_expires_at?: string
          token_hash?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "guardians_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "guardians_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: true
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      incidents: {
        Row: {
          admin_notes: string | null
          category: string
          created_at: string
          description: string
          id: string
          message_id: string | null
          reporter_id: string | null
          reporter_label: string | null
          reporter_role: Database["public"]["Enums"]["user_role"] | null
          resolved_at: string | null
          resolved_by: string | null
          session_id: string | null
          status: Database["public"]["Enums"]["incident_status"]
          student_id: string | null
          tutor_auto_paused: boolean
          tutor_id: string | null
          updated_at: string
        }
        Insert: {
          admin_notes?: string | null
          category: string
          created_at?: string
          description: string
          id?: string
          message_id?: string | null
          reporter_id?: string | null
          reporter_label?: string | null
          reporter_role?: Database["public"]["Enums"]["user_role"] | null
          resolved_at?: string | null
          resolved_by?: string | null
          session_id?: string | null
          status?: Database["public"]["Enums"]["incident_status"]
          student_id?: string | null
          tutor_auto_paused?: boolean
          tutor_id?: string | null
          updated_at?: string
        }
        Update: {
          admin_notes?: string | null
          category?: string
          created_at?: string
          description?: string
          id?: string
          message_id?: string | null
          reporter_id?: string | null
          reporter_label?: string | null
          reporter_role?: Database["public"]["Enums"]["user_role"] | null
          resolved_at?: string | null
          resolved_by?: string | null
          session_id?: string | null
          status?: Database["public"]["Enums"]["incident_status"]
          student_id?: string | null
          tutor_auto_paused?: boolean
          tutor_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "incidents_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "incidents_reporter_id_fkey"
            columns: ["reporter_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "incidents_resolved_by_fkey"
            columns: ["resolved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "incidents_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "incidents_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "incidents_tutor_id_fkey"
            columns: ["tutor_id"]
            isOneToOne: false
            referencedRelation: "tutor_profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      message_templates: {
        Row: {
          audience: string
          body: string
          is_active: boolean
          key: string
          label: string
          sort_order: number
        }
        Insert: {
          audience: string
          body: string
          is_active?: boolean
          key: string
          label: string
          sort_order?: number
        }
        Update: {
          audience?: string
          body?: string
          is_active?: boolean
          key?: string
          label?: string
          sort_order?: number
        }
        Relationships: []
      }
      messages: {
        Row: {
          body: string
          created_at: string
          hidden_at: string | null
          hidden_by: string | null
          id: string
          kind: Database["public"]["Enums"]["message_kind"]
          scanned_at: string | null
          sender_id: string | null
          session_id: string | null
          template_key: string | null
          thread_id: string
        }
        Insert: {
          body: string
          created_at?: string
          hidden_at?: string | null
          hidden_by?: string | null
          id?: string
          kind: Database["public"]["Enums"]["message_kind"]
          scanned_at?: string | null
          sender_id?: string | null
          session_id?: string | null
          template_key?: string | null
          thread_id: string
        }
        Update: {
          body?: string
          created_at?: string
          hidden_at?: string | null
          hidden_by?: string | null
          id?: string
          kind?: Database["public"]["Enums"]["message_kind"]
          scanned_at?: string | null
          sender_id?: string | null
          session_id?: string | null
          template_key?: string | null
          thread_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "messages_hidden_by_fkey"
            columns: ["hidden_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_template_key_fkey"
            columns: ["template_key"]
            isOneToOne: false
            referencedRelation: "message_templates"
            referencedColumns: ["key"]
          },
          {
            foreignKeyName: "messages_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "threads"
            referencedColumns: ["id"]
          },
        ]
      }
      moderation_flags: {
        Row: {
          author_id: string | null
          auto_actions: string[]
          category: string
          created_at: string
          evidence: Json
          excerpt: string | null
          id: number
          message_id: string | null
          review_note: string | null
          reviewed_at: string | null
          run_id: number | null
          score: number
          severity: string
          source_id: string
          source_type: string
          status: string
          thread_id: string | null
          updated_at: string
        }
        Insert: {
          author_id?: string | null
          auto_actions?: string[]
          category: string
          created_at?: string
          evidence?: Json
          excerpt?: string | null
          id?: never
          message_id?: string | null
          review_note?: string | null
          reviewed_at?: string | null
          run_id?: number | null
          score?: number
          severity: string
          source_id: string
          source_type: string
          status?: string
          thread_id?: string | null
          updated_at?: string
        }
        Update: {
          author_id?: string | null
          auto_actions?: string[]
          category?: string
          created_at?: string
          evidence?: Json
          excerpt?: string | null
          id?: never
          message_id?: string | null
          review_note?: string | null
          reviewed_at?: string | null
          run_id?: number | null
          score?: number
          severity?: string
          source_id?: string
          source_type?: string
          status?: string
          thread_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "moderation_flags_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "moderation_flags_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "moderation_flags_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "moderation_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "moderation_flags_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "threads"
            referencedColumns: ["id"]
          },
        ]
      }
      moderation_runs: {
        Row: {
          error: string | null
          finished_at: string | null
          flagged: number
          id: number
          scanned: number
          source: string
          started_at: string
        }
        Insert: {
          error?: string | null
          finished_at?: string | null
          flagged?: number
          id?: never
          scanned?: number
          source: string
          started_at?: string
        }
        Update: {
          error?: string | null
          finished_at?: string | null
          flagged?: number
          id?: never
          scanned?: number
          source?: string
          started_at?: string
        }
        Relationships: []
      }
      partners: {
        Row: {
          cause_description: string
          cause_title: string
          created_at: string
          donation_url: string | null
          id: string
          is_current: boolean
          name: string
          partnership_confirmed: boolean
          short_name: string | null
          updated_at: string
          website_url: string | null
        }
        Insert: {
          cause_description?: string
          cause_title: string
          created_at?: string
          donation_url?: string | null
          id?: string
          is_current?: boolean
          name: string
          partnership_confirmed?: boolean
          short_name?: string | null
          updated_at?: string
          website_url?: string | null
        }
        Update: {
          cause_description?: string
          cause_title?: string
          created_at?: string
          donation_url?: string | null
          id?: string
          is_current?: boolean
          name?: string
          partnership_confirmed?: boolean
          short_name?: string | null
          updated_at?: string
          website_url?: string | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          account_kind: string | null
          adult_attested_at: string | null
          avatar_path: string | null
          created_at: string
          email: string
          email_notifications: boolean
          full_name: string
          id: string
          messaging_terms_accepted_at: string | null
          messaging_terms_version: string | null
          onboarded_at: string | null
          partner_id: string | null
          phone: string | null
          role: Database["public"]["Enums"]["user_role"]
          terms_accepted_at: string | null
          terms_version: string | null
          updated_at: string
        }
        Insert: {
          account_kind?: string | null
          adult_attested_at?: string | null
          avatar_path?: string | null
          created_at?: string
          email: string
          email_notifications?: boolean
          full_name?: string
          id: string
          messaging_terms_accepted_at?: string | null
          messaging_terms_version?: string | null
          onboarded_at?: string | null
          partner_id?: string | null
          phone?: string | null
          role: Database["public"]["Enums"]["user_role"]
          terms_accepted_at?: string | null
          terms_version?: string | null
          updated_at?: string
        }
        Update: {
          account_kind?: string | null
          adult_attested_at?: string | null
          avatar_path?: string | null
          created_at?: string
          email?: string
          email_notifications?: boolean
          full_name?: string
          id?: string
          messaging_terms_accepted_at?: string | null
          messaging_terms_version?: string | null
          onboarded_at?: string | null
          partner_id?: string | null
          phone?: string | null
          role?: Database["public"]["Enums"]["user_role"]
          terms_accepted_at?: string | null
          terms_version?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
        ]
      }
      session_events: {
        Row: {
          actor_id: string | null
          created_at: string
          from_status: Database["public"]["Enums"]["session_status"] | null
          id: number
          note: string | null
          session_id: string
          start_at: string | null
          to_status: Database["public"]["Enums"]["session_status"]
        }
        Insert: {
          actor_id?: string | null
          created_at?: string
          from_status?: Database["public"]["Enums"]["session_status"] | null
          id?: never
          note?: string | null
          session_id: string
          start_at?: string | null
          to_status: Database["public"]["Enums"]["session_status"]
        }
        Update: {
          actor_id?: string | null
          created_at?: string
          from_status?: Database["public"]["Enums"]["session_status"] | null
          id?: never
          note?: string | null
          session_id?: string
          start_at?: string | null
          to_status?: Database["public"]["Enums"]["session_status"]
        }
        Relationships: [
          {
            foreignKeyName: "session_events_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "session_events_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      sessions: {
        Row: {
          cancel_reason: string | null
          cancelled_by: string | null
          created_at: string
          decline_reason: string | null
          duration_minutes: number
          end_at: string
          family_id: string
          family_responded_at: string | null
          family_response_note: string | null
          id: string
          proposal_round: number
          proposed_by: string
          request_note: string | null
          review_note: string | null
          start_at: string
          status: Database["public"]["Enums"]["session_status"]
          student_id: string
          subject_id: string
          tutor_id: string
          tutor_log_note: string | null
          tutor_logged_at: string | null
          updated_at: string
          verified_at: string | null
          verified_by: string | null
        }
        Insert: {
          cancel_reason?: string | null
          cancelled_by?: string | null
          created_at?: string
          decline_reason?: string | null
          duration_minutes: number
          end_at: string
          family_id: string
          family_responded_at?: string | null
          family_response_note?: string | null
          id?: string
          proposal_round?: number
          proposed_by: string
          request_note?: string | null
          review_note?: string | null
          start_at: string
          status?: Database["public"]["Enums"]["session_status"]
          student_id: string
          subject_id: string
          tutor_id: string
          tutor_log_note?: string | null
          tutor_logged_at?: string | null
          updated_at?: string
          verified_at?: string | null
          verified_by?: string | null
        }
        Update: {
          cancel_reason?: string | null
          cancelled_by?: string | null
          created_at?: string
          decline_reason?: string | null
          duration_minutes?: number
          end_at?: string
          family_id?: string
          family_responded_at?: string | null
          family_response_note?: string | null
          id?: string
          proposal_round?: number
          proposed_by?: string
          request_note?: string | null
          review_note?: string | null
          start_at?: string
          status?: Database["public"]["Enums"]["session_status"]
          student_id?: string
          subject_id?: string
          tutor_id?: string
          tutor_log_note?: string | null
          tutor_logged_at?: string | null
          updated_at?: string
          verified_at?: string | null
          verified_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sessions_cancelled_by_fkey"
            columns: ["cancelled_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sessions_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sessions_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sessions_subject_id_fkey"
            columns: ["subject_id"]
            isOneToOne: false
            referencedRelation: "subjects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sessions_tutor_id_fkey"
            columns: ["tutor_id"]
            isOneToOne: false
            referencedRelation: "tutor_profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "sessions_verified_by_fkey"
            columns: ["verified_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      student_subjects: {
        Row: {
          created_at: string
          has_instrument: boolean
          in_school_program: boolean
          level: Database["public"]["Enums"]["skill_level"]
          student_id: string
          subject_id: string
          years_playing: number
        }
        Insert: {
          created_at?: string
          has_instrument: boolean
          in_school_program?: boolean
          level: Database["public"]["Enums"]["skill_level"]
          student_id: string
          subject_id: string
          years_playing?: number
        }
        Update: {
          created_at?: string
          has_instrument?: boolean
          in_school_program?: boolean
          level?: Database["public"]["Enums"]["skill_level"]
          student_id?: string
          subject_id?: string
          years_playing?: number
        }
        Relationships: [
          {
            foreignKeyName: "student_subjects_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_subjects_subject_id_fkey"
            columns: ["subject_id"]
            isOneToOne: false
            referencedRelation: "subjects"
            referencedColumns: ["id"]
          },
        ]
      }
      students: {
        Row: {
          availability: string[]
          county: string | null
          created_at: string
          explain_style: string | null
          family_id: string
          first_name: string
          goals: string[]
          grade: number
          id: string
          interests: string[]
          is_active: boolean
          learning_style: string | null
          notes: string | null
          preferred_minutes: number
          school: string | null
          updated_at: string
        }
        Insert: {
          availability?: string[]
          county?: string | null
          created_at?: string
          explain_style?: string | null
          family_id: string
          first_name: string
          goals?: string[]
          grade: number
          id?: string
          interests?: string[]
          is_active?: boolean
          learning_style?: string | null
          notes?: string | null
          preferred_minutes?: number
          school?: string | null
          updated_at?: string
        }
        Update: {
          availability?: string[]
          county?: string | null
          created_at?: string
          explain_style?: string | null
          family_id?: string
          first_name?: string
          goals?: string[]
          grade?: number
          id?: string
          interests?: string[]
          is_active?: boolean
          learning_style?: string | null
          notes?: string | null
          preferred_minutes?: number
          school?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "students_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      subjects: {
        Row: {
          aliases: string[]
          created_at: string
          created_by: string | null
          family: string
          id: string
          is_active: boolean
          is_custom: boolean
          kind: string
          name: string
          related_group: string | null
          slug: string
        }
        Insert: {
          aliases?: string[]
          created_at?: string
          created_by?: string | null
          family: string
          id?: string
          is_active?: boolean
          is_custom?: boolean
          kind?: string
          name: string
          related_group?: string | null
          slug: string
        }
        Update: {
          aliases?: string[]
          created_at?: string
          created_by?: string | null
          family?: string
          id?: string
          is_active?: boolean
          is_custom?: boolean
          kind?: string
          name?: string
          related_group?: string | null
          slug?: string
        }
        Relationships: [
          {
            foreignKeyName: "subjects_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      threads: {
        Row: {
          created_at: string
          family_id: string
          family_last_read_at: string | null
          id: string
          last_message_at: string | null
          student_id: string
          tutor_id: string
          tutor_last_read_at: string | null
        }
        Insert: {
          created_at?: string
          family_id: string
          family_last_read_at?: string | null
          id?: string
          last_message_at?: string | null
          student_id: string
          tutor_id: string
          tutor_last_read_at?: string | null
        }
        Update: {
          created_at?: string
          family_id?: string
          family_last_read_at?: string | null
          id?: string
          last_message_at?: string | null
          student_id?: string
          tutor_id?: string
          tutor_last_read_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "threads_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "threads_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "threads_tutor_id_fkey"
            columns: ["tutor_id"]
            isOneToOne: false
            referencedRelation: "tutor_profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      tutor_offers: {
        Row: {
          created_at: string
          id: string
          note: string | null
          student_id: string
          subject_id: string
          tutor_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          note?: string | null
          student_id: string
          subject_id: string
          tutor_id: string
        }
        Update: {
          created_at?: string
          id?: string
          note?: string | null
          student_id?: string
          subject_id?: string
          tutor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tutor_offers_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tutor_offers_subject_id_fkey"
            columns: ["subject_id"]
            isOneToOne: false
            referencedRelation: "subjects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tutor_offers_tutor_id_fkey"
            columns: ["tutor_id"]
            isOneToOne: false
            referencedRelation: "tutor_profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      tutor_profiles: {
        Row: {
          accepting_students: boolean
          agreement_signature: string | null
          agreement_signed_at: string | null
          agreement_version: string | null
          approved_at: string | null
          availability: string[]
          bio: string | null
          county: string | null
          created_at: string
          explain_style: string | null
          grade: number | null
          guardian_email: string | null
          guardian_name: string | null
          guardian_phone: string | null
          interests: string[]
          max_students: number
          meet_url: string | null
          school: string | null
          session_minutes: number[]
          status: Database["public"]["Enums"]["tutor_status"]
          status_changed_at: string | null
          status_changed_by: string | null
          status_reason: string | null
          teaching_strengths: string[]
          teaching_style: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          accepting_students?: boolean
          agreement_signature?: string | null
          agreement_signed_at?: string | null
          agreement_version?: string | null
          approved_at?: string | null
          availability?: string[]
          bio?: string | null
          county?: string | null
          created_at?: string
          explain_style?: string | null
          grade?: number | null
          guardian_email?: string | null
          guardian_name?: string | null
          guardian_phone?: string | null
          interests?: string[]
          max_students?: number
          meet_url?: string | null
          school?: string | null
          session_minutes?: number[]
          status?: Database["public"]["Enums"]["tutor_status"]
          status_changed_at?: string | null
          status_changed_by?: string | null
          status_reason?: string | null
          teaching_strengths?: string[]
          teaching_style?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          accepting_students?: boolean
          agreement_signature?: string | null
          agreement_signed_at?: string | null
          agreement_version?: string | null
          approved_at?: string | null
          availability?: string[]
          bio?: string | null
          county?: string | null
          created_at?: string
          explain_style?: string | null
          grade?: number | null
          guardian_email?: string | null
          guardian_name?: string | null
          guardian_phone?: string | null
          interests?: string[]
          max_students?: number
          meet_url?: string | null
          school?: string | null
          session_minutes?: number[]
          status?: Database["public"]["Enums"]["tutor_status"]
          status_changed_at?: string | null
          status_changed_by?: string | null
          status_reason?: string | null
          teaching_strengths?: string[]
          teaching_style?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tutor_profiles_status_changed_by_fkey"
            columns: ["status_changed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tutor_profiles_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      tutor_subjects: {
        Row: {
          created_at: string
          own_level: Database["public"]["Enums"]["skill_level"]
          subject_id: string
          teach_levels: Database["public"]["Enums"]["skill_level"][]
          top_ensemble: string
          tutor_id: string
          years_playing: number
        }
        Insert: {
          created_at?: string
          own_level: Database["public"]["Enums"]["skill_level"]
          subject_id: string
          teach_levels: Database["public"]["Enums"]["skill_level"][]
          top_ensemble?: string
          tutor_id: string
          years_playing: number
        }
        Update: {
          created_at?: string
          own_level?: Database["public"]["Enums"]["skill_level"]
          subject_id?: string
          teach_levels?: Database["public"]["Enums"]["skill_level"][]
          top_ensemble?: string
          tutor_id?: string
          years_playing?: number
        }
        Relationships: [
          {
            foreignKeyName: "tutor_subjects_subject_id_fkey"
            columns: ["subject_id"]
            isOneToOne: false
            referencedRelation: "subjects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tutor_subjects_tutor_id_fkey"
            columns: ["tutor_id"]
            isOneToOne: false
            referencedRelation: "tutor_profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      accept_terms: { Args: { p_kind: string }; Returns: undefined }
      admin_cron_http: { Args: never; Returns: Json }
      admin_activity: {
        Args: { p_action?: string; p_before?: number; p_limit?: number }
        Returns: {
          action: string
          actor_id: string
          actor_kind: string
          actor_name: string
          created_at: string
          data: Json
          id: number
          target_id: string
          target_type: string
        }[]
      }
      admin_erase_account: {
        Args: { p_reason: string; p_user: string }
        Returns: string
      }
      admin_find_user: {
        Args: { p_email: string }
        Returns: {
          created_at: string
          email: string
          full_name: string
          id: string
          partner_id: string
          role: Database["public"]["Enums"]["user_role"]
        }[]
      }
      admin_health: { Args: never; Returns: Json }
      admin_hide_message: {
        Args: { p_hide: boolean; p_message: string }
        Returns: undefined
      }
      admin_list_families: {
        Args: { p_search?: string }
        Returns: {
          adult_attested_at: string
          created_at: string
          email: string
          full_name: string
          lessons: number
          onboarded_at: string
          phone: string
          students: Json
          user_id: string
        }[]
      }
      admin_list_flags: {
        Args: { p_limit?: number; p_status?: string }
        Returns: {
          author_id: string
          author_kind: string
          author_name: string
          auto_actions: string[]
          category: string
          created_at: string
          evidence: Json
          excerpt: string
          id: number
          message_hidden: boolean
          message_id: string
          review_note: string
          reviewed_at: string
          score: number
          severity: string
          source_id: string
          source_type: string
          status: string
          thread_id: string
        }[]
      }
      admin_list_incidents: {
        Args: { p_status?: string }
        Returns: {
          admin_notes: string
          category: string
          created_at: string
          description: string
          id: string
          message_body: string
          message_id: string
          reporter_email: string
          reporter_id: string
          reporter_label: string
          reporter_name: string
          reporter_role: Database["public"]["Enums"]["user_role"]
          resolved_at: string
          session_id: string
          session_start: string
          status: Database["public"]["Enums"]["incident_status"]
          student_family_id: string
          student_id: string
          student_name: string
          thread_id: string
          tutor_auto_paused: boolean
          tutor_id: string
          tutor_name: string
          tutor_status: Database["public"]["Enums"]["tutor_status"]
        }[]
      }
      admin_list_sessions: {
        Args: { p_limit?: number; p_status?: string }
        Returns: {
          cancel_reason: string
          created_at: string
          duration_minutes: number
          family_email: string
          family_name: string
          family_response_note: string
          id: string
          review_note: string
          start_at: string
          status: Database["public"]["Enums"]["session_status"]
          student_name: string
          subject_name: string
          tutor_id: string
          tutor_name: string
        }[]
      }
      admin_list_threads: {
        Args: { p_limit?: number; p_search?: string }
        Returns: {
          family_id: string
          family_kind: string
          family_name: string
          hidden: number
          id: string
          last_message_at: string
          messages: number
          open_flags: number
          student_name: string
          tutor_id: string
          tutor_name: string
        }[]
      }
      admin_list_tutors: {
        Args: { p_search?: string; p_status?: string }
        Returns: {
          active_students: number
          agreement_signed_at: string
          approved_at: string
          avatar_path: string
          county: string
          created_at: string
          email: string
          full_name: string
          grade: number
          guardian_email: string
          guardian_name: string
          guardian_phone: string
          lessons_verified: number
          max_students: number
          meet_url: string
          onboarded_at: string
          open_incidents: number
          school: string
          status: Database["public"]["Enums"]["tutor_status"]
          status_reason: string
          subjects: string
          user_id: string
        }[]
      }
      admin_login_allowed: { Args: { p_ip: string }; Returns: boolean }
      admin_login_record: {
        Args: { p_ip: string; p_ok: boolean }
        Returns: undefined
      }
      admin_overview: { Args: never; Returns: Json }
      admin_people: {
        Args: {
          p_kind?: string
          p_limit?: number
          p_offset?: number
          p_search?: string
        }
        Returns: {
          created_at: string
          detail: string
          email: string
          full_name: string
          id: string
          kind: string
          last_sign_in_at: string
          lessons: number
          onboarded: boolean
          open_flags: number
          open_reports: number
          status: string
          total_count: number
        }[]
      }
      admin_person: { Args: { p_id: string }; Returns: Json }
      admin_retry_email: { Args: { p_id: number }; Returns: undefined }
      admin_set_current_partner: {
        Args: { p_partner: string }
        Returns: undefined
      }
      admin_set_role: {
        Args: {
          p_partner?: string
          p_role: Database["public"]["Enums"]["user_role"]
          p_user: string
        }
        Returns: undefined
      }
      admin_set_tutor_status: {
        Args: {
          p_reason?: string
          p_status: Database["public"]["Enums"]["tutor_status"]
          p_tutor: string
        }
        Returns: undefined
      }
      admin_thread: { Args: { p_thread: string }; Returns: Json }
      admin_thread_messages: {
        Args: { p_thread: string }
        Returns: {
          body: string
          created_at: string
          hidden_at: string
          id: string
          kind: Database["public"]["Enums"]["message_kind"]
          sender_id: string
          sender_name: string
        }[]
      }
      admin_update_flag: {
        Args: { p_id: number; p_note?: string; p_status: string }
        Returns: undefined
      }
      admin_update_incident: {
        Args: {
          p_incident: string
          p_notes?: string
          p_status: Database["public"]["Enums"]["incident_status"]
        }
        Returns: undefined
      }
      admin_update_settings: {
        Args: { p_admin_emails: string[]; p_require_tutor_approval: boolean }
        Returns: undefined
      }
      attest_guardian: { Args: never; Returns: undefined }
      auth_user_by_email: {
        Args: { p_email: string }
        Returns: {
          confirmed: boolean
          id: string
        }[]
      }
      cancel_session: {
        Args: { p_reason?: string; p_session: string }
        Returns: undefined
      }
      check_email_code: {
        Args: { p_code_hash: string; p_email: string; p_purpose: string }
        Returns: string
      }
      claim_outbox: {
        Args: { p_limit?: number }
        Returns: {
          attempts: number
          created_at: string
          dedupe_key: string | null
          id: number
          last_error: string | null
          locked_at: string | null
          payload: Json
          send_after: string
          sent_at: string | null
          status: Database["public"]["Enums"]["outbox_status"]
          template: string
          to_email: string
          to_name: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "email_outbox"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      clear_email_code: {
        Args: { p_email: string; p_purpose: string; p_send_id?: number }
        Returns: undefined
      }
      connected_student_kinds: {
        Args: never
        Returns: {
          family_id: string
          kind: string
          student_id: string
        }[]
      }
      complete_onboarding: { Args: never; Returns: Json }
      confirm_session: {
        Args: { p_happened: boolean; p_note?: string; p_session: string }
        Returns: Database["public"]["Enums"]["session_status"]
      }
      finish_outbox: {
        Args: { p_error?: string; p_id: number; p_ok: boolean }
        Returns: undefined
      }
      get_public_config: { Args: never; Returns: Json }
      guardian_delete_account: {
        Args: { p_confirm: string; p_token: string }
        Returns: string
      }
      guardian_report: {
        Args: {
          p_category: string
          p_description: string
          p_token: string
          p_tutor?: string
        }
        Returns: string
      }
      guardian_request_link: { Args: { p_email: string }; Returns: undefined }
      guardian_revoke: { Args: { p_token: string }; Returns: number }
      guardian_sign_consent: {
        Args: {
          p_adult_guardian: boolean
          p_free_no_payment: boolean
          p_guardian_name: string
          p_incident_process: boolean
          p_messaging_monitoring: boolean
          p_no_recording: boolean
          p_online_only: boolean
          p_phone: string
          p_reachable: boolean
          p_relationship: string
          p_signature: string
          p_token: string
          p_user_agent?: string
        }
        Returns: string
      }
      guardian_view: { Args: { p_token: string }; Returns: Json }
      issue_email_code: {
        Args: {
          p_code_hash: string
          p_email: string
          p_ip?: string
          p_purpose: string
          p_ttl_minutes?: number
        }
        Returns: number
      }
      list_students_for_tutor: {
        Args: {
          p_limit?: number
          p_offset?: number
          p_search?: string
          p_student?: string
          p_subject_ids?: string[]
        }
        Returns: {
          availability: string[]
          connected: boolean
          county: string
          explain_style: string
          first_name: string
          goals: string[]
          grade: number
          interests: string[]
          learning_style: string
          offered_at: string
          preferred_minutes: number
          student_id: string
          subjects: Json
          total_count: number
          tutor_count: number
        }[]
      }
      list_tutors: {
        Args: {
          p_limit?: number
          p_offset?: number
          p_search?: string
          p_subject_ids?: string[]
          p_tutor?: string
        }
        Returns: {
          accepting_students: boolean
          active_students: number
          availability: string[]
          avatar_path: string
          bio: string
          county: string
          display_name: string
          explain_style: string
          grade: number
          interests: string[]
          late_cancels_90d: number
          lessons_completed: number
          max_students: number
          school: string
          session_minutes: number[]
          subjects: Json
          teaching_strengths: string[]
          teaching_style: string
          total_count: number
          tutor_id: string
          verified_minutes: number
        }[]
      }
      log_app_event: {
        Args: {
          p_action: string
          p_actor: string
          p_data?: Json
          p_target_id: string
          p_target_type: string
        }
        Returns: undefined
      }
      log_session: {
        Args: { p_happened: boolean; p_note?: string; p_session: string }
        Returns: Database["public"]["Enums"]["session_status"]
      }
      mark_thread_read: { Args: { p_thread: string }; Returns: undefined }
      moderation_apply: {
        Args: { p_flags: Json; p_run: number; p_scanned: string[] }
        Returns: number
      }
      moderation_batch: {
        Args: { p_limit?: number }
        Returns: {
          body: string
          created_at: string
          id: string
          sender_id: string
          sender_kind: string
          sender_side: string
          student_id: string
          thread_id: string
          tutor_id: string
        }[]
      }
      moderation_finish: {
        Args: { p_error?: string; p_run: number }
        Returns: undefined
      }
      moderation_other_texts: {
        Args: { p_since: string }
        Returns: {
          author_id: string
          body: string
          source_id: string
          source_type: string
        }[]
      }
      moderation_start: { Args: { p_source: string }; Returns: number }
      moderation_thread_context: {
        Args: { p_days?: number; p_thread_ids: string[] }
        Returns: {
          body: string
          created_at: string
          id: string
          sender_id: string
          sender_side: string
          thread_id: string
        }[]
      }
      my_offers: {
        Args: never
        Returns: {
          created_at: string
          id: string
          note: string
          student_id: string
          student_name: string
          subject_id: string
          subject_name: string
          thread_id: string
          tutor_avatar: string
          tutor_id: string
          tutor_name: string
        }[]
      }
      my_sessions: {
        Args: { p_limit?: number; p_offset?: number; p_scope?: string }
        Returns: {
          awaiting_me: boolean
          cancel_reason: string
          created_at: string
          decline_reason: string
          duration_minutes: number
          end_at: string
          family_name: string
          family_responded_at: string
          family_response_note: string
          id: string
          meet_url: string
          my_side: string
          proposal_round: number
          proposed_by: string
          request_note: string
          review_note: string
          start_at: string
          status: Database["public"]["Enums"]["session_status"]
          student_grade: number
          student_id: string
          student_name: string
          subject_id: string
          subject_name: string
          thread_id: string
          tutor_avatar: string
          tutor_id: string
          tutor_log_note: string
          tutor_logged_at: string
          tutor_name: string
          verified_at: string
          verifier_org: string
        }[]
      }
      my_threads: {
        Args: never
        Returns: {
          family_name: string
          id: string
          last_body: string
          last_kind: Database["public"]["Enums"]["message_kind"]
          last_message_at: string
          my_side: string
          student_id: string
          student_name: string
          tutor_avatar: string
          tutor_id: string
          tutor_name: string
          tutor_status: Database["public"]["Enums"]["tutor_status"]
          unread: boolean
        }[]
      }
      report_incident: {
        Args: {
          p_category: string
          p_description: string
          p_message?: string
          p_session?: string
          p_student?: string
          p_tutor?: string
        }
        Returns: string
      }
      request_session: {
        Args: {
          p_minutes: number
          p_note?: string
          p_start: string
          p_student: string
          p_subject: string
          p_tutor: string
        }
        Returns: string
      }
      resolve_dispute: {
        Args: { p_happened: boolean; p_note: string; p_session: string }
        Returns: undefined
      }
      resolve_subject: {
        Args: { p_family?: string; p_name: string }
        Returns: {
          aliases: string[]
          created_at: string
          created_by: string | null
          family: string
          id: string
          is_active: boolean
          is_custom: boolean
          kind: string
          name: string
          related_group: string | null
          slug: string
        }
        SetofOptions: {
          from: "*"
          to: "subjects"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      respond_session: {
        Args: {
          p_action: string
          p_minutes?: number
          p_note?: string
          p_session: string
          p_start?: string
        }
        Returns: Database["public"]["Enums"]["session_status"]
      }
      review_queue: {
        Args: { p_week_start: string }
        Returns: {
          duration_minutes: number
          family_responded_at: string
          family_response_note: string
          review_note: string
          session_id: string
          start_at: string
          status: Database["public"]["Enums"]["session_status"]
          student_name: string
          subject_name: string
          tutor_grade: number
          tutor_id: string
          tutor_log_note: string
          tutor_logged_at: string
          tutor_name: string
          tutor_school: string
          verified_at: string
          verifier_name: string
        }[]
      }
      review_sessions: {
        Args: { p_approve: boolean; p_note?: string; p_session_ids: string[] }
        Returns: number
      }
      review_weeks: {
        Args: { p_limit?: number }
        Returns: {
          awaiting_family: number
          confirmed: number
          disputed: number
          minutes_verified: number
          rejected: number
          verified: number
          week_start: string
        }[]
      }
      revoke_consent: { Args: { p_student: string }; Returns: number }
      revoke_user_sessions: { Args: { p_user: string }; Returns: undefined }
      send_message: {
        Args: { p_body?: string; p_template?: string; p_thread: string }
        Returns: string
      }
      sign_consent: {
        Args: {
          p_free_no_payment: boolean
          p_guardian_name: string
          p_incident_process: boolean
          p_messaging_monitoring: boolean
          p_no_recording: boolean
          p_online_only: boolean
          p_phone: string
          p_reachable: boolean
          p_relationship: string
          p_signature: string
          p_student: string
          p_user_agent?: string
        }
        Returns: string
      }
      sign_tutor_agreement: {
        Args: {
          p_guardian_email: string
          p_guardian_name: string
          p_guardian_phone: string
          p_signature: string
        }
        Returns: undefined
      }
      start_thread: {
        Args: { p_student: string; p_tutor: string }
        Returns: string
      }
      student_profile_for_tutor: { Args: { p_student: string }; Returns: Json }
      student_set_guardian: {
        Args: { p_email: string; p_name: string }
        Returns: undefined
      }
      tutor_offer: {
        Args: { p_note?: string; p_student: string; p_subject: string }
        Returns: string
      }
    }
    Enums: {
      incident_status: "open" | "reviewing" | "resolved"
      message_kind: "template" | "custom" | "system"
      outbox_status: "queued" | "sending" | "sent" | "failed"
      session_status:
        | "pending"
        | "scheduled"
        | "declined"
        | "cancelled"
        | "expired"
        | "completed"
        | "confirmed"
        | "disputed"
        | "verified"
        | "rejected"
      skill_level: "beginner" | "developing" | "intermediate" | "advanced"
      tutor_status: "pending" | "active" | "paused" | "removed"
      user_role: "tutor" | "family" | "admin" | "reviewer"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
      incident_status: ["open", "reviewing", "resolved"],
      message_kind: ["template", "custom", "system"],
      outbox_status: ["queued", "sending", "sent", "failed"],
      session_status: [
        "pending",
        "scheduled",
        "declined",
        "cancelled",
        "expired",
        "completed",
        "confirmed",
        "disputed",
        "verified",
        "rejected",
      ],
      skill_level: ["beginner", "developing", "intermediate", "advanced"],
      tutor_status: ["pending", "active", "paused", "removed"],
      user_role: ["tutor", "family", "admin", "reviewer"],
    },
  },
} as const
