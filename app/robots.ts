import type { MetadataRoute } from 'next'
import { getBaseUrl } from '@/lib/utils'

export default function robots(): MetadataRoute.Robots {
  const baseUrl = getBaseUrl()
  return {
    rules: [
      {
        userAgent: '*',
        allow: ['/', '/login', '/signup', '/forgot-password', '/reset-password', '/terms', '/privacy'],
        disallow: [
          '/api/',
          '/research',
          '/search',
          '/manual-import',
          '/profile',
          '/settings',
          '/auth/',
        ],
      },
    ],
    sitemap: `${baseUrl}/sitemap.xml`,
  }
}
