/**
 * Get the correct site URL based on environment
 * This ensures email links work in both development and production
 */
export function getSiteUrl(): string {
  // Check for custom domain or Vercel URL
  if (process.env.NEXT_PUBLIC_SITE_URL) {
    return process.env.NEXT_PUBLIC_SITE_URL
  }

  // Vercel deployment URL
  if (process.env.NEXT_PUBLIC_VERCEL_URL) {
    return `https://${process.env.NEXT_PUBLIC_VERCEL_URL}`
  }

  // Fallback to localhost for development
  return 'http://localhost:3000'
}
