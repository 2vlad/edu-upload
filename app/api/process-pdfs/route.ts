import { type NextRequest } from 'next/server'

/**
 * Legacy endpoint - redirects to /api/process-files
 * Maintained for backward compatibility
 */
export async function POST(request: NextRequest) {
  // Forward request to new endpoint
  const formData = await request.formData()

  const response = await fetch(new URL('/api/process-files', request.url), {
    method: 'POST',
    body: formData,
  })

  const data = await response.json()

  return Response.json(data, {
    status: response.status,
    headers: {
      'X-Deprecated-Endpoint': 'true',
      'X-New-Endpoint': '/api/process-files',
    },
  })
}
