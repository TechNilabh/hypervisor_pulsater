/**
 * API Configuration
 *
 * Single source of truth for the backend base URL.
 *
 * - In production (Vercel), set NEXT_PUBLIC_API_URL in your Vercel
 *   project environment variables to https://pulsater-backend.onrender.com
 * - For local development, .env.local sets it to http://localhost:8080
 */
export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";
