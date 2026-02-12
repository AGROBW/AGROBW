import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { NewsItem } from '../../types'

export const useNews = () => {
  const [news, setNews] = useState<NewsItem[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const fetchNews = async () => {
      setIsLoading(true)
      const { data, error } = await supabase
        .from('news')
        .select('*')
        .order('published_at', { ascending: false })

      if (error) {
        setError(error.message)
        setNews([])
      } else {
        const mapped: NewsItem[] = (data || []).map((item: any) => ({
          id: item.id,
          category: item.category,
          date: item.published_at || item.created_at,
          title: item.title,
          summary: item.summary,
          imageUrl: item.image_url,
          link: item.link
        }))
        setNews(mapped)
      }
      setIsLoading(false)
    }

    fetchNews()
  }, [])

  return { news, isLoading, error }
}