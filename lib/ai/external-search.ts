/**
 * External Web Search Service
 *
 * Provides web search capabilities using SearXNG for search and Crawlee for content extraction.
 * This is the fallback when internal documents don't have relevant information.
 *
 * SECURITY:
 * - Services are internal-only (bound to 127.0.0.1)
 * - External content is NEVER persisted to database
 * - URL validation blocks internal/private networks
 * - Content size limits enforced
 */

import type {
  WebSearchResult,
  ExternalContext,
  ExternalSearchResult,
  ExternalSearchHealthStatus,
} from './external-search-types';

// ============================================================================
// CONFIGURATION
// ============================================================================

const SEARXNG_URL = process.env.SEARXNG_URL || 'http://127.0.0.1:8888';
const CRAWLEE_URL = process.env.CRAWLEE_URL || 'http://127.0.0.1:8889';
const EXTERNAL_SEARCH_ENABLED = process.env.EXTERNAL_SEARCH_ENABLED !== 'false';

// Search configuration
const MAX_SEARCH_RESULTS = 5;
const MAX_CRAWL_URLS = 5;
const MAX_CHUNK_SIZE = 1500; // Characters per chunk
const MAX_CHUNKS_PER_SOURCE = 3;
const SEARCH_TIMEOUT = 10000; // 10 seconds
const CRAWL_TIMEOUT = 35000; // 35 seconds (slightly more than crawler's 30s)

// ============================================================================
// WEB SEARCH (SearXNG)
// ============================================================================

/**
 * Search the web using SearXNG.
 *
 * @param query - Search query
 * @returns Array of search results with URLs, titles, and snippets
 */
export async function searchWeb(query: string): Promise<{
  results: WebSearchResult[];
  error?: string;
}> {
  if (!EXTERNAL_SEARCH_ENABLED) {
    return { results: [], error: 'External search is disabled' };
  }

  try {
    const searchParams = new URLSearchParams({
      q: query,
      format: 'json',
      categories: 'general',
      language: 'en',
      pageno: '1',
    });

    const response = await fetch(`${SEARXNG_URL}/search?${searchParams}`, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
      },
      signal: AbortSignal.timeout(SEARCH_TIMEOUT),
    });

    if (!response.ok) {
      return {
        results: [],
        error: `SearXNG returned ${response.status}: ${response.statusText}`,
      };
    }

    const data = await response.json();

    // Extract and normalize results
    const results: WebSearchResult[] = (data.results || [])
      .slice(0, MAX_SEARCH_RESULTS)
      .map((r: Record<string, unknown>) => ({
        url: String(r.url || ''),
        title: String(r.title || ''),
        snippet: String(r.content || ''),
        engine: String(r.engine || 'unknown'),
      }))
      .filter((r: WebSearchResult) => r.url && r.url.startsWith('http'));

    return { results };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[External Search] SearXNG error:', message);
    return { results: [], error: message };
  }
}

// ============================================================================
// WEB CRAWLING (Crawlee Service)
// ============================================================================

/**
 * Crawl URLs and extract content using the Crawlee service.
 *
 * @param urls - Array of URLs to crawl
 * @returns Array of crawled content results
 */
export async function crawlUrls(urls: string[]): Promise<{
  results: Array<{
    url: string;
    title: string | null;
    content: string;
    success: boolean;
    error?: string;
  }>;
  error?: string;
}> {
  if (!EXTERNAL_SEARCH_ENABLED) {
    return { results: [], error: 'External search is disabled' };
  }

  if (urls.length === 0) {
    return { results: [] };
  }

  // Limit URLs
  const urlsToFetch = urls.slice(0, MAX_CRAWL_URLS);

  try {
    const response = await fetch(`${CRAWLEE_URL}/crawl/batch`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        urls: urlsToFetch,
        extract_main_content: true,
      }),
      signal: AbortSignal.timeout(CRAWL_TIMEOUT),
    });

    if (!response.ok) {
      return {
        results: [],
        error: `Crawlee returned ${response.status}: ${response.statusText}`,
      };
    }

    const data = await response.json();

    return {
      results: (data.results || []).map((r: Record<string, unknown>) => ({
        url: String(r.url || ''),
        title: r.title ? String(r.title) : null,
        content: String(r.content || ''),
        success: Boolean(r.success),
        error: r.error ? String(r.error) : undefined,
      })),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[External Search] Crawlee error:', message);
    return { results: [], error: message };
  }
}

// ============================================================================
// CONTENT PROCESSING
// ============================================================================

/**
 * Process crawled content into chunks for prompt building.
 *
 * NOTE: These chunks are EPHEMERAL and NOT persisted to database.
 * They exist only for the duration of the chat request.
 *
 * @param crawled - Array of crawled content
 * @returns Array of processed ExternalContext
 */
export function processExternalContent(
  crawled: Array<{
    url: string;
    title: string | null;
    content: string;
    success: boolean;
    error?: string;
  }>
): ExternalContext[] {
  const contexts: ExternalContext[] = [];

  for (const item of crawled) {
    if (!item.success || !item.content.trim()) {
      continue;
    }

    // Clean content
    const cleanedContent = cleanContent(item.content);

    if (cleanedContent.length < 100) {
      // Skip very short content
      continue;
    }

    // Chunk the content
    const chunks = chunkContent(cleanedContent, MAX_CHUNK_SIZE, MAX_CHUNKS_PER_SOURCE);

    contexts.push({
      url: item.url,
      title: item.title,
      content: cleanedContent.slice(0, MAX_CHUNK_SIZE * MAX_CHUNKS_PER_SOURCE), // Truncate full content
      chunks,
    });
  }

  return contexts;
}

/**
 * Clean crawled content by removing excess whitespace and normalizing.
 */
function cleanContent(content: string): string {
  return content
    // Normalize whitespace
    .replace(/\s+/g, ' ')
    // Remove multiple newlines
    .replace(/\n{3,}/g, '\n\n')
    // Trim
    .trim();
}

/**
 * Split content into chunks for prompt building.
 */
function chunkContent(
  content: string,
  chunkSize: number,
  maxChunks: number
): string[] {
  const chunks: string[] = [];
  const paragraphs = content.split(/\n\n+/);

  let currentChunk = '';

  for (const paragraph of paragraphs) {
    if (chunks.length >= maxChunks) {
      break;
    }

    // If adding this paragraph exceeds chunk size, save current and start new
    if (currentChunk.length + paragraph.length > chunkSize && currentChunk.length > 0) {
      chunks.push(currentChunk.trim());
      currentChunk = paragraph;
    } else {
      currentChunk += (currentChunk ? '\n\n' : '') + paragraph;
    }

    // If current chunk exceeds max, truncate and save
    if (currentChunk.length > chunkSize) {
      chunks.push(currentChunk.slice(0, chunkSize).trim());
      currentChunk = '';
    }
  }

  // Don't forget the last chunk
  if (currentChunk.trim() && chunks.length < maxChunks) {
    chunks.push(currentChunk.trim());
  }

  return chunks;
}

// ============================================================================
// FULL EXTERNAL SEARCH FLOW
// ============================================================================

/**
 * Perform full external search: search → crawl → process.
 *
 * This is the main entry point for external web search.
 *
 * @param query - User's question
 * @returns Processed external context ready for prompt building
 */
export async function performExternalSearch(
  query: string
): Promise<ExternalSearchResult> {
  const result: ExternalSearchResult = {
    contexts: [],
    hasContent: false,
    query,
    searchedUrls: [],
    errors: [],
  };

  // Check if external search is enabled
  if (!EXTERNAL_SEARCH_ENABLED) {
    result.errors.push('External search is disabled');
    return result;
  }

  // Step 1: Search the web
  console.log(`[External Search] Searching for: "${query.slice(0, 50)}..."`);
  const { results: searchResults, error: searchError } = await searchWeb(query);

  if (searchError) {
    result.errors.push(`Search error: ${searchError}`);
  }

  if (searchResults.length === 0) {
    console.log('[External Search] No search results found');
    return result;
  }

  // Extract URLs to crawl
  const urlsToCrawl = searchResults.map((r) => r.url);
  result.searchedUrls = urlsToCrawl;

  console.log(`[External Search] Found ${urlsToCrawl.length} URLs, crawling...`);

  // Step 2: Crawl the URLs
  const { results: crawlResults, error: crawlError } = await crawlUrls(urlsToCrawl);

  if (crawlError) {
    result.errors.push(`Crawl error: ${crawlError}`);
  }

  // Step 3: Process the content
  result.contexts = processExternalContent(crawlResults);
  result.hasContent = result.contexts.length > 0;

  console.log(
    `[External Search] Processed ${result.contexts.length} sources with content`
  );

  return result;
}

// ============================================================================
// HEALTH CHECKS
// ============================================================================

/**
 * Check health of external search services.
 *
 * @returns Health status of SearXNG and Crawlee services
 */
export async function checkExternalSearchHealth(): Promise<ExternalSearchHealthStatus> {
  const status: ExternalSearchHealthStatus = {
    searxng: {
      available: false,
      url: SEARXNG_URL,
    },
    crawlee: {
      available: false,
      url: CRAWLEE_URL,
    },
    externalSearchEnabled: EXTERNAL_SEARCH_ENABLED,
  };

  if (!EXTERNAL_SEARCH_ENABLED) {
    status.searxng.error = 'External search is disabled';
    status.crawlee.error = 'External search is disabled';
    return status;
  }

  // Check SearXNG
  try {
    const response = await fetch(`${SEARXNG_URL}/healthz`, {
      signal: AbortSignal.timeout(5000),
    });
    status.searxng.available = response.ok;
    if (!response.ok) {
      status.searxng.error = `HTTP ${response.status}`;
    }
  } catch (error) {
    status.searxng.error = error instanceof Error ? error.message : 'Unknown error';
  }

  // Check Crawlee
  try {
    const response = await fetch(`${CRAWLEE_URL}/health`, {
      signal: AbortSignal.timeout(5000),
    });
    status.crawlee.available = response.ok;
    if (!response.ok) {
      status.crawlee.error = `HTTP ${response.status}`;
    }
  } catch (error) {
    status.crawlee.error = error instanceof Error ? error.message : 'Unknown error';
  }

  return status;
}

/**
 * Check if external search is available (both services healthy).
 */
export async function isExternalSearchAvailable(): Promise<boolean> {
  if (!EXTERNAL_SEARCH_ENABLED) {
    return false;
  }

  const health = await checkExternalSearchHealth();
  return health.searxng.available && health.crawlee.available;
}
