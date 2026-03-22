import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { NewsItem } from '../../types'
import { classifyNewsEditorialCategory, normalizeEditorialCategory } from '../utils/newsEditorialCategory'

export const useNews = () => {
  const [news, setNews] = useState<NewsItem[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const fetchNews = async () => {
      setIsLoading(true)
      const { data: articlesData, error: articlesError } = await supabase
        .from('news_articles')
        .select(`
          id,
          title,
          summary,
          slug,
          editorial_category,
          featured_image_url,
          published_at,
          news_ingestions (
            original_portal_name
          )
        `)
        .eq('status', 'published')
        .order('published_at', { ascending: false })

      if (!articlesError && (articlesData || []).length > 0) {
        const mapped: NewsItem[] = (articlesData || []).map((item: any) => ({
          id: item.id,
          category:
            normalizeEditorialCategory(item.editorial_category) ||
            classifyNewsEditorialCategory({
              title: item.title,
              summary: item.summary,
              portalName: item.news_ingestions?.original_portal_name,
            }),
          date: item.published_at,
          title: item.title,
          summary: item.summary,
          imageUrl: item.featured_image_url,
          link: `#/noticias/${item.slug}`
        }))
        setNews(mapped)
        setError(null)
      } else {
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
          setError(articlesError?.message || null)
        }
      }
      setIsLoading(false)
    }

    fetchNews()
  }, [])

  return { news, isLoading, error }
}
