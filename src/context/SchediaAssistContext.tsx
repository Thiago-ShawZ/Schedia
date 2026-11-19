import React, { createContext, useContext, useState, useCallback, useMemo } from 'react'

export interface SchediaAssistBizData {
  id: string
  name: string
  description?: string | null
  city?: string | null
  phone?: string | null
  slug?: string
}

export interface SchediaAssistServiceData {
  name: string
  description?: string | null
  price_cents: number
  duration_min: number
}

export interface SchediaAssistProductData {
  name: string
  description?: string | null
  price_cents: number
}

export interface SchediaAssistSettingsData {
  timezone?: string
  opening_hours?: Record<string, unknown>
  min_cancel_hours?: number
}

export interface SchediaAssistBookingData {
  name: string
  price_cents: number
  duration_min: number
  step?: number
  when?: string
}

export interface AssistContextPayload {
  biz?: SchediaAssistBizData | null
  services?: SchediaAssistServiceData[]
  products?: SchediaAssistProductData[]
  settings?: SchediaAssistSettingsData | null
  currentService?: SchediaAssistBookingData | null
  bookingStep?: number
  bookingWhen?: string
}

export interface SchediaAssistContextValue {
  biz: SchediaAssistBizData | null
  services: SchediaAssistServiceData[]
  products: SchediaAssistProductData[]
  settings: SchediaAssistSettingsData | null
  currentService: SchediaAssistBookingData | null
  bookingStep?: number
  bookingWhen?: string
  setBizContext: (data: AssistContextPayload | null) => void
  clearBizContext: () => void
}

const SchediaAssistContext = createContext<SchediaAssistContextValue | undefined>(undefined)

export function SchediaAssistProvider({ children }: { children: React.ReactNode }) {
  const [biz, setBiz] = useState<SchediaAssistBizData | null>(null)
  const [services, setServices] = useState<SchediaAssistServiceData[]>([])
  const [products, setProducts] = useState<SchediaAssistProductData[]>([])
  const [settings, setSettings] = useState<SchediaAssistSettingsData | null>(null)
  const [currentService, setCurrentService] = useState<SchediaAssistBookingData | null>(null)
  const [bookingStep, setBookingStep] = useState<number | undefined>(undefined)
  const [bookingWhen, setBookingWhen] = useState<string | undefined>(undefined)

  const setBizContext = useCallback((data: AssistContextPayload | null) => {
    if (!data || !data.biz) {
      setBiz(null)
      setServices([])
      setProducts([])
      setSettings(null)
      setCurrentService(null)
      setBookingStep(undefined)
      setBookingWhen(undefined)
      return
    }

    setBiz(data.biz)
    setServices(data.services || [])
    setProducts(data.products || [])
    setSettings(data.settings || null)
    setCurrentService(data.currentService || null)
    setBookingStep(data.bookingStep)
    setBookingWhen(data.bookingWhen)
  }, [])

  const clearBizContext = useCallback(() => {
    setBiz(null)
    setServices([])
    setProducts([])
    setSettings(null)
    setCurrentService(null)
    setBookingStep(undefined)
    setBookingWhen(undefined)
  }, [])

  const value = useMemo(
    () => ({
      biz,
      services,
      products,
      settings,
      currentService,
      bookingStep,
      bookingWhen,
      setBizContext,
      clearBizContext,
    }),
    [biz, services, products, settings, currentService, bookingStep, bookingWhen, setBizContext, clearBizContext]
  )

  return <SchediaAssistContext.Provider value={value}>{children}</SchediaAssistContext.Provider>
}

export function useSchediaAssist() {
  const ctx = useContext(SchediaAssistContext)
  if (!ctx) {
    throw new Error('useSchediaAssist must be used within a SchediaAssistProvider')
  }
  return ctx
}
