import type { MetadataRoute } from 'next'
import { getBaseUrl } from '@/lib/utils'

export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = getBaseUrl()
  const now = new Date()

  return [
    { url: `${baseUrl}/`,                changeFrequency: 'monthly', priority: 1.0, lastModified: now },
    { url: `${baseUrl}/pricing`,         changeFrequency: 'monthly', priority: 0.8, lastModified: now },
    { url: `${baseUrl}/login`,           changeFrequency: 'yearly',  priority: 0.5, lastModified: now },
    { url: `${baseUrl}/signup`,          changeFrequency: 'yearly',  priority: 0.8, lastModified: now },
    { url: `${baseUrl}/forgot-password`, changeFrequency: 'yearly',  priority: 0.3, lastModified: now },
    { url: `${baseUrl}/terms`,           changeFrequency: 'yearly',  priority: 0.4, lastModified: now },
    { url: `${baseUrl}/privacy`,         changeFrequency: 'yearly',  priority: 0.4, lastModified: now },
  ]
}
