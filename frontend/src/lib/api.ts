/**
 * API Client for Backend Communication
 */

import { supabase } from './supabase';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

/**
 * Get authorization header with Supabase token
 */
async function getAuthHeaders() {
  const { data: { session } } = await supabase.auth.getSession();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (session?.access_token) {
    headers['Authorization'] = `Bearer ${session.access_token}`;
  }

  return headers;
}

/**
 * Check usage limits
 */
export async function checkUsage(visitorId?: string) {
  const headers = await getAuthHeaders();
  const url = new URL(`${API_URL}/api/usage/check`);

  if (visitorId) {
    url.searchParams.set('visitor_id', visitorId);
  }

  const response = await fetch(url.toString(), { headers });

  if (!response.ok) {
    throw new Error('Failed to check usage');
  }

  return response.json();
}

/**
 * Increment usage counter
 */
export async function incrementUsage(visitorId?: string) {
  const headers = await getAuthHeaders();

  const response = await fetch(`${API_URL}/api/usage/increment`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ visitor_id: visitorId }),
  });

  if (!response.ok) {
    throw new Error('Failed to increment usage');
  }

  return response.json();
}

/**
 * Parse dimension with Gemini
 */
export async function parseDimension(text: string) {
  const headers = await getAuthHeaders();

  const response = await fetch(`${API_URL}/api/gemini`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ text }),
  });

  if (!response.ok) {
    throw new Error('Failed to parse dimension');
  }

  return response.json();
}

/**
 * OCR image with Google Vision
 */
export async function ocrImage(image: string) {
  const headers = await getAuthHeaders();

  const response = await fetch(`${API_URL}/api/ocr`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ image }),
  });

  if (!response.ok) {
    throw new Error('OCR failed');
  }

  return response.json();
}

/**
 * Create checkout session
 */
export async function createCheckout(planType: 'tier_20' | 'tier_99', visitorId?: string) {
  const headers = await getAuthHeaders();

  const response = await fetch(`${API_URL}/api/checkout/create`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ plan_type: planType, visitor_id: visitorId }),
  });

  if (!response.ok) {
    throw new Error('Failed to create checkout');
  }

  return response.json();
}

/**
 * Export to Excel
 */
export async function exportToExcel(characteristics: any[], metadata: any, watermark = false) {
  const headers = await getAuthHeaders();

  const response = await fetch(`${API_URL}/api/export/excel`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ characteristics, metadata, watermark }),
  });

  if (!response.ok) {
    throw new Error('Failed to export Excel');
  }

  return response.blob();
}
