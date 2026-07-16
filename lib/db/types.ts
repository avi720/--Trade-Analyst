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
      AIConversation: {
        Row: {
          contextType: string
          createdAt: string
          id: string
          messages: Json
          updatedAt: string
          userId: string
        }
        Insert: {
          contextType: string
          createdAt?: string
          id?: string
          messages: Json
          updatedAt: string
          userId: string
        }
        Update: {
          contextType?: string
          createdAt?: string
          id?: string
          messages?: Json
          updatedAt?: string
          userId?: string
        }
        Relationships: [
          {
            foreignKeyName: "AIConversation_userId_fkey"
            columns: ["userId"]
            isOneToOne: false
            referencedRelation: "User"
            referencedColumns: ["id"]
          },
        ]
      }
      AuditEvent: {
        Row: {
          createdAt: string
          eventType: string
          id: string
          ipAddress: string | null
          metadata: Json | null
          status: string
          userAgent: string | null
          userId: string | null
        }
        Insert: {
          createdAt?: string
          eventType: string
          id?: string
          ipAddress?: string | null
          metadata?: Json | null
          status: string
          userAgent?: string | null
          userId?: string | null
        }
        Update: {
          createdAt?: string
          eventType?: string
          id?: string
          ipAddress?: string | null
          metadata?: Json | null
          status?: string
          userAgent?: string | null
          userId?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "AuditEvent_userId_fkey"
            columns: ["userId"]
            isOneToOne: false
            referencedRelation: "User"
            referencedColumns: ["id"]
          },
        ]
      }
      BillingWebhookEvent: {
        Row: {
          event_id: string
          event_name: string
          id: string
          received_at: string
        }
        Insert: {
          event_id: string
          event_name: string
          id?: string
          received_at?: string
        }
        Update: {
          event_id?: string
          event_name?: string
          id?: string
          received_at?: string
        }
        Relationships: []
      }
      BrokerConnection: {
        Row: {
          accountId: string | null
          brokerName: string
          flexQueryIdActivity: string
          flexTokenEncrypted: string
          id: string
          isActive: boolean
          lastPriceSyncAt: string | null
          lastPriceSyncStatus: string | null
          lastSyncAt: string | null
          lastSyncError: string | null
          lastSyncStatus: string | null
          pricePollingIntervalMin: number
          userId: string
        }
        Insert: {
          accountId?: string | null
          brokerName: string
          flexQueryIdActivity: string
          flexTokenEncrypted: string
          id?: string
          isActive?: boolean
          lastPriceSyncAt?: string | null
          lastPriceSyncStatus?: string | null
          lastSyncAt?: string | null
          lastSyncError?: string | null
          lastSyncStatus?: string | null
          pricePollingIntervalMin?: number
          userId: string
        }
        Update: {
          accountId?: string | null
          brokerName?: string
          flexQueryIdActivity?: string
          flexTokenEncrypted?: string
          id?: string
          isActive?: boolean
          lastPriceSyncAt?: string | null
          lastPriceSyncStatus?: string | null
          lastSyncAt?: string | null
          lastSyncError?: string | null
          lastSyncStatus?: string | null
          pricePollingIntervalMin?: number
          userId?: string
        }
        Relationships: [
          {
            foreignKeyName: "BrokerConnection_userId_fkey"
            columns: ["userId"]
            isOneToOne: false
            referencedRelation: "User"
            referencedColumns: ["id"]
          },
        ]
      }
      BrokerEvent: {
        Row: {
          eventType: string
          id: string
          processedAt: string | null
          processingError: string | null
          processingStatus: string
          rawPayload: Json
          receivedAt: string
          source: string
          userId: string
        }
        Insert: {
          eventType: string
          id?: string
          processedAt?: string | null
          processingError?: string | null
          processingStatus: string
          rawPayload: Json
          receivedAt?: string
          source: string
          userId: string
        }
        Update: {
          eventType?: string
          id?: string
          processedAt?: string | null
          processingError?: string | null
          processingStatus?: string
          rawPayload?: Json
          receivedAt?: string
          source?: string
          userId?: string
        }
        Relationships: [
          {
            foreignKeyName: "BrokerEvent_userId_fkey"
            columns: ["userId"]
            isOneToOne: false
            referencedRelation: "User"
            referencedColumns: ["id"]
          },
        ]
      }
      ExcelImportJob: {
        Row: {
          aiMapping: Json | null
          completedAt: string | null
          createdAt: string
          errorMessage: string | null
          extractedLegs: Json | null
          fileSize: number
          id: string
          importSummary: Json | null
          originalFilename: string
          parseErrors: Json | null
          rowCountRaw: number | null
          sourceTimezone: string
          status: string
          storagePath: string
          updatedAt: string
          userId: string
        }
        Insert: {
          aiMapping?: Json | null
          completedAt?: string | null
          createdAt?: string
          errorMessage?: string | null
          extractedLegs?: Json | null
          fileSize: number
          id?: string
          importSummary?: Json | null
          originalFilename: string
          parseErrors?: Json | null
          rowCountRaw?: number | null
          sourceTimezone: string
          status?: string
          storagePath: string
          updatedAt?: string
          userId: string
        }
        Update: {
          aiMapping?: Json | null
          completedAt?: string | null
          createdAt?: string
          errorMessage?: string | null
          extractedLegs?: Json | null
          fileSize?: number
          id?: string
          importSummary?: Json | null
          originalFilename?: string
          parseErrors?: Json | null
          rowCountRaw?: number | null
          sourceTimezone?: string
          status?: string
          storagePath?: string
          updatedAt?: string
          userId?: string
        }
        Relationships: [
          {
            foreignKeyName: "ExcelImportJob_userId_fkey"
            columns: ["userId"]
            isOneToOne: false
            referencedRelation: "User"
            referencedColumns: ["id"]
          },
        ]
      }
      Order: {
        Row: {
          broker: string | null
          brokerClientAccountId: string | null
          brokerExecId: string
          brokerOrderId: string | null
          commission: number | null
          commissionCurrency: string | null
          currency: string | null
          executedAt: string
          id: string
          netCash: number | null
          orderTime: string | null
          orderType: string | null
          price: number
          quantity: number
          side: string
          tradeId: string
          userId: string
        }
        Insert: {
          broker?: string | null
          brokerClientAccountId?: string | null
          brokerExecId: string
          brokerOrderId?: string | null
          commission?: number | null
          commissionCurrency?: string | null
          currency?: string | null
          executedAt: string
          id?: string
          netCash?: number | null
          orderTime?: string | null
          orderType?: string | null
          price: number
          quantity: number
          side: string
          tradeId: string
          userId: string
        }
        Update: {
          broker?: string | null
          brokerClientAccountId?: string | null
          brokerExecId?: string
          brokerOrderId?: string | null
          commission?: number | null
          commissionCurrency?: string | null
          currency?: string | null
          executedAt?: string
          id?: string
          netCash?: number | null
          orderTime?: string | null
          orderType?: string | null
          price?: number
          quantity?: number
          side?: string
          tradeId?: string
          userId?: string
        }
        Relationships: [
          {
            foreignKeyName: "Order_tradeId_fkey"
            columns: ["tradeId"]
            isOneToOne: false
            referencedRelation: "Trade"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "Order_userId_fkey"
            columns: ["userId"]
            isOneToOne: false
            referencedRelation: "User"
            referencedColumns: ["id"]
          },
        ]
      }
      RateLimit: {
        Row: {
          count: number
          key: string
          windowStart: string
        }
        Insert: {
          count?: number
          key: string
          windowStart?: string
        }
        Update: {
          count?: number
          key?: string
          windowStart?: string
        }
        Relationships: []
      }
      Trade: {
        Row: {
          actualR: number | null
          assetType: string
          avgEntryPrice: number
          avgExitPrice: number | null
          closedAt: string | null
          closeReason: string | null
          didRight: string | null
          direction: string
          emotionalState: string | null
          executionQuality: number | null
          externalRefId: string | null
          id: string
          lastKnownPrice: number | null
          lastPriceUpdateAt: string | null
          multiplier: number
          notes: string | null
          openedAt: string
          realizedPnl: number | null
          result: string | null
          rMultipleEntry: number | null
          setupType: string | null
          source: string
          status: string
          stopPrice: number | null
          targetPrice: number | null
          ticker: string
          totalCommission: number | null
          totalQuantity: number
          totalQuantityOpened: number
          userId: string
          wouldChange: string | null
        }
        Insert: {
          actualR?: number | null
          assetType?: string
          avgEntryPrice: number
          avgExitPrice?: number | null
          closedAt?: string | null
          closeReason?: string | null
          didRight?: string | null
          direction: string
          emotionalState?: string | null
          executionQuality?: number | null
          externalRefId?: string | null
          id?: string
          lastKnownPrice?: number | null
          lastPriceUpdateAt?: string | null
          multiplier?: number
          notes?: string | null
          openedAt: string
          realizedPnl?: number | null
          result?: string | null
          rMultipleEntry?: number | null
          setupType?: string | null
          source?: string
          status: string
          stopPrice?: number | null
          targetPrice?: number | null
          ticker: string
          totalCommission?: number | null
          totalQuantity: number
          totalQuantityOpened: number
          userId: string
          wouldChange?: string | null
        }
        Update: {
          actualR?: number | null
          assetType?: string
          avgEntryPrice?: number
          avgExitPrice?: number | null
          closedAt?: string | null
          closeReason?: string | null
          didRight?: string | null
          direction?: string
          emotionalState?: string | null
          executionQuality?: number | null
          externalRefId?: string | null
          id?: string
          lastKnownPrice?: number | null
          lastPriceUpdateAt?: string | null
          multiplier?: number
          notes?: string | null
          openedAt?: string
          realizedPnl?: number | null
          result?: string | null
          rMultipleEntry?: number | null
          setupType?: string | null
          source?: string
          status?: string
          stopPrice?: number | null
          targetPrice?: number | null
          ticker?: string
          totalCommission?: number | null
          totalQuantity?: number
          totalQuantityOpened?: number
          userId?: string
          wouldChange?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "Trade_userId_fkey"
            columns: ["userId"]
            isOneToOne: false
            referencedRelation: "User"
            referencedColumns: ["id"]
          },
        ]
      }
      User: {
        Row: {
          addressCity: string | null
          addressCountry: string | null
          addressStreet: string | null
          createdAt: string
          email: string
          firstName: string | null
          id: string
          lastName: string | null
          lemonsqueezyCustomerId: string | null
          lemonsqueezySubscriptionId: string | null
          name: string | null
          phone: string | null
          settings: Json
          subscriptionRenewsAt: string | null
          subscriptionStatus: string | null
          subscriptionTier: string
        }
        Insert: {
          addressCity?: string | null
          addressCountry?: string | null
          addressStreet?: string | null
          createdAt?: string
          email: string
          firstName?: string | null
          id?: string
          lastName?: string | null
          lemonsqueezyCustomerId?: string | null
          lemonsqueezySubscriptionId?: string | null
          name?: string | null
          phone?: string | null
          settings?: Json
          subscriptionRenewsAt?: string | null
          subscriptionStatus?: string | null
          subscriptionTier?: string
        }
        Update: {
          addressCity?: string | null
          addressCountry?: string | null
          addressStreet?: string | null
          createdAt?: string
          email?: string
          firstName?: string | null
          id?: string
          lastName?: string | null
          lemonsqueezyCustomerId?: string | null
          lemonsqueezySubscriptionId?: string | null
          name?: string | null
          phone?: string | null
          settings?: Json
          subscriptionRenewsAt?: string | null
          subscriptionStatus?: string | null
          subscriptionTier?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      claim_excel_import_job: {
        Args: never
        Returns: {
          aiMapping: Json | null
          completedAt: string | null
          createdAt: string
          errorMessage: string | null
          extractedLegs: Json | null
          fileSize: number
          id: string
          importSummary: Json | null
          originalFilename: string
          parseErrors: Json | null
          rowCountRaw: number | null
          sourceTimezone: string
          status: string
          storagePath: string
          updatedAt: string
          userId: string
        }[]
        SetofOptions: {
          from: "*"
          to: "ExcelImportJob"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      rate_limit_check: {
        Args: { p_key: string; p_limit: number; p_window_seconds: number }
        Returns: {
          ok: boolean
          remaining: number
          reset_at: string
        }[]
      }
      reverse_position: {
        Args: {
          p_actual_r: number
          p_avg_exit_price: number
          p_close_at: string
          p_close_order: Json
          p_close_status: string
          p_close_trade_id: string
          p_new_order: Json
          p_new_trade: Json
          p_realized_pnl: number
          p_result: string
          p_total_commission: number
        }
        Returns: undefined
      }
    }
    Enums: {
      [_ in never]: never
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
    Enums: {},
  },
} as const
