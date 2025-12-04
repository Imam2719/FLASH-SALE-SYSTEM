const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

// ========================================
// TYPES & INTERFACES
// ========================================

export interface Product {
  id: string;
  name: string;
  price: number;
  availableStock: number;
  totalStock: number;
}

export interface Reservation {
  id: string;
  productId: string;
  quantity: number;
  status: 'ACTIVE' | 'COMPLETED' | 'EXPIRED';
  createdAt: string;
  expiresAt: string;
}

export interface CreateReservationDto {
  productId: string;
  quantity: number;
}

export interface ApiError {
  message: string;
  statusCode?: number;
  error?: string;
}

// ========================================
// CUSTOM ERROR CLASS
// ========================================

export class ApiRequestError extends Error {
  statusCode: number;
  error: string;

  constructor(message: string, statusCode: number = 500, error: string = 'Internal Server Error') {
    super(message);
    this.name = 'ApiRequestError';
    this.statusCode = statusCode;
    this.error = error;
  }
}

// ========================================
// UTILITY FUNCTIONS
// ========================================

/**
 * Sleep utility for retry logic
 */
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Fetch with timeout
 */
async function fetchWithTimeout(
  url: string,
  options: RequestInit = {},
  timeout: number = 10000
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    return response;
  } catch (error) {
    clearTimeout(timeoutId);
    if (error instanceof Error && error.name === 'AbortError') {
      throw new ApiRequestError('Request timeout', 408, 'Request Timeout');
    }
    throw error;
  }
}

/**
 * Fetch with retry logic
 */
async function fetchWithRetry(
  url: string,
  options: RequestInit = {},
  maxRetries: number = 3,
  retryDelay: number = 1000
): Promise<Response> {
  let lastError: Error | null = null;

  for (let i = 0; i < maxRetries; i++) {
    try {
      const response = await fetchWithTimeout(url, options);
      
      // Don't retry on 4xx errors (client errors)
      if (response.status >= 400 && response.status < 500) {
        return response;
      }

      // Retry on 5xx errors (server errors)
      if (response.status >= 500 && i < maxRetries - 1) {
        console.warn(`Server error (${response.status}), retrying... (${i + 1}/${maxRetries})`);
        await sleep(retryDelay * (i + 1)); // Exponential backoff
        continue;
      }

      return response;
    } catch (error) {
      lastError = error as Error;
      
      if (i < maxRetries - 1) {
        console.warn(`Request failed, retrying... (${i + 1}/${maxRetries})`, error);
        await sleep(retryDelay * (i + 1));
      }
    }
  }

  throw lastError || new ApiRequestError('Request failed after retries', 500);
}

/**
 * Handle API response
 */
async function handleResponse<T>(response: Response): Promise<T> {
  const contentType = response.headers.get('content-type');
  const isJson = contentType?.includes('application/json');

  if (!response.ok) {
    let errorMessage = 'An error occurred';
    let errorDetails = response.statusText;

    if (isJson) {
      try {
        const errorData: ApiError = await response.json();
        errorMessage = errorData.message || errorMessage;
        errorDetails = errorData.error || errorDetails;
      } catch (e) {
        // Failed to parse error JSON
        console.error('Failed to parse error response:', e);
      }
    } else {
      // Try to read as text
      try {
        errorMessage = await response.text();
      } catch (e) {
        // Ignore
      }
    }

    throw new ApiRequestError(errorMessage, response.status, errorDetails);
  }

  if (isJson) {
    return response.json();
  }

  // Return empty object if no content
  if (response.status === 204) {
    return {} as T;
  }

  throw new ApiRequestError('Invalid response format', 500, 'Invalid Content-Type');
}

/**
 * Build URL with query params
 */
function buildUrl(path: string, params?: Record<string, any>): string {
  const url = new URL(path, API_URL);
  
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        url.searchParams.append(key, String(value));
      }
    });
  }

  return url.toString();
}

// ========================================
// API CLIENT
// ========================================

export const api = {
  /**
   * Get all products
   */
  async getProducts(): Promise<Product[]> {
    try {
      const response = await fetchWithRetry(buildUrl('/products'), {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
        cache: 'no-store',
      });

      return handleResponse<Product[]>(response);
    } catch (error) {
      if (error instanceof ApiRequestError) {
        throw error;
      }
      throw new ApiRequestError(
        'Failed to fetch products. Please check your connection.',
        0,
        'Network Error'
      );
    }
  },

  /**
   * Get single product by ID
   */
  async getProduct(id: string): Promise<Product> {
    try {
      const response = await fetchWithRetry(buildUrl(`/products/${id}`), {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
        cache: 'no-store',
      });

      return handleResponse<Product>(response);
    } catch (error) {
      if (error instanceof ApiRequestError) {
        throw error;
      }
      throw new ApiRequestError(
        'Failed to fetch product details.',
        0,
        'Network Error'
      );
    }
  },

  /**
   * Create a new reservation
   */
  async createReservation(
    productId: string,
    quantity: number
  ): Promise<Reservation> {
    try {
      const response = await fetchWithTimeout(
        buildUrl('/reservations'),
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ productId, quantity }),
        },
        15000 // 15 second timeout for reservation
      );

      return handleResponse<Reservation>(response);
    } catch (error) {
      if (error instanceof ApiRequestError) {
        throw error;
      }
      throw new ApiRequestError(
        'Failed to create reservation. Please try again.',
        0,
        'Network Error'
      );
    }
  },

  /**
   * Complete a reservation (purchase)
   */
  async completeReservation(reservationId: string): Promise<Reservation> {
    try {
      const response = await fetchWithTimeout(
        buildUrl(`/reservations/${reservationId}/complete`),
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
        },
        10000 // 10 second timeout
      );

      return handleResponse<Reservation>(response);
    } catch (error) {
      if (error instanceof ApiRequestError) {
        throw error;
      }
      throw new ApiRequestError(
        'Failed to complete reservation.',
        0,
        'Network Error'
      );
    }
  },

  /**
   * Get all reservations
   */
  async getReservations(): Promise<Reservation[]> {
    try {
      const response = await fetchWithRetry(buildUrl('/reservations'), {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
        cache: 'no-store',
      });

      return handleResponse<Reservation[]>(response);
    } catch (error) {
      if (error instanceof ApiRequestError) {
        throw error;
      }
      throw new ApiRequestError(
        'Failed to fetch reservations.',
        0,
        'Network Error'
      );
    }
  },

  /**
   * Get single reservation by ID
   */
  async getReservation(reservationId: string): Promise<Reservation> {
    try {
      const response = await fetchWithRetry(
        buildUrl(`/reservations/${reservationId}`),
        {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
          },
          cache: 'no-store',
        }
      );

      return handleResponse<Reservation>(response);
    } catch (error) {
      if (error instanceof ApiRequestError) {
        throw error;
      }
      throw new ApiRequestError(
        'Failed to fetch reservation details.',
        0,
        'Network Error'
      );
    }
  },

  /**
   * Health check
   */
  async healthCheck(): Promise<{ status: string }> {
    try {
      const response = await fetchWithTimeout(buildUrl('/'), {
        method: 'GET',
      });

      if (response.ok) {
        return { status: 'healthy' };
      }

      throw new ApiRequestError('API is not healthy', response.status);
    } catch (error) {
      if (error instanceof ApiRequestError) {
        throw error;
      }
      throw new ApiRequestError(
        'Failed to connect to API.',
        0,
        'Network Error'
      );
    }
  },
};

// ========================================
// HELPER FUNCTIONS FOR COMPONENTS
// ========================================

/**
 * Format error message for display
 */
export function formatErrorMessage(error: unknown): string {
  if (error instanceof ApiRequestError) {
    if (error.statusCode === 0) {
      return '🌐 Network error. Please check your internet connection.';
    }
    if (error.statusCode === 408) {
      return '⏰ Request timeout. Please try again.';
    }
    if (error.statusCode === 404) {
      return '🔍 Resource not found.';
    }
    if (error.statusCode >= 500) {
      return '🔧 Server error. Please try again later.';
    }
    return `❌ ${error.message}`;
  }

  if (error instanceof Error) {
    return `❌ ${error.message}`;
  }

  return '❌ An unexpected error occurred.';
}

/**
 * Check if reservation is expired (client-side check)
 */
export function isReservationExpired(reservation: Reservation): boolean {
  const now = new Date().getTime();
  const expiresAt = new Date(reservation.expiresAt).getTime();
  return now >= expiresAt;
}

/**
 * Get remaining time in seconds
 */
export function getRemainingTime(reservation: Reservation): number {
  const now = new Date().getTime();
  const expiresAt = new Date(reservation.expiresAt).getTime();
  const diff = expiresAt - now;
  return Math.max(0, Math.floor(diff / 1000));
}

/**
 * Format time (seconds to MM:SS)
 */
export function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

/**
 * Calculate stock percentage
 */
export function getStockPercentage(product: Product): number {
  return Math.round((product.availableStock / product.totalStock) * 100);
}

/**
 * Get stock status
 */
export function getStockStatus(
  product: Product
): 'out-of-stock' | 'low-stock' | 'in-stock' {
  if (product.availableStock === 0) return 'out-of-stock';
  if (product.availableStock <= 5) return 'low-stock';
  return 'in-stock';
}