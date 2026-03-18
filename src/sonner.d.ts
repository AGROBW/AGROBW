declare module 'sonner' {
  import * as React from 'react'

  export interface ToastOptions {
    description?: React.ReactNode
    duration?: number
    icon?: React.ReactNode
    style?: React.CSSProperties
  }

  export interface ToasterProps {
    position?: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'top-center' | 'bottom-center'
    expand?: boolean
    toastOptions?: Record<string, any>
  }

  export const Toaster: React.FC<ToasterProps>
  export const toast: {
    success: (message: string, options?: ToastOptions) => void
    error: (message: string, options?: ToastOptions) => void
    info: (message: string, options?: ToastOptions) => void
    warning: (message: string, options?: ToastOptions) => void
  }
}
