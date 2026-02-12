import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../contexts/AuthContext'
import { Invoice } from '../../types'

export const useInvoices = () => {
  const { user } = useAuth()
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const fetchInvoices = async () => {
      if (!user?.id) {
        setInvoices([])
        setIsLoading(false)
        return
      }

      setIsLoading(true)
      const { data, error } = await supabase
        .from('invoices')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })

      if (error) {
        setError(error.message)
        setInvoices([])
      } else {
        const mapped: Invoice[] = (data || []).map((inv: any) => ({
          id: inv.id,
          date: inv.created_at || inv.date,
          amount: parseFloat(inv.amount ?? inv.total ?? 0),
          status: inv.status,
          planName: inv.plan_name || inv.plan || 'Plano',
          pdfUrl: inv.pdf_url || inv.invoice_url || ''
        }))
        setInvoices(mapped)
      }
      setIsLoading(false)
    }

    fetchInvoices()
  }, [user?.id])

  return { invoices, isLoading, error }
}