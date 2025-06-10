import FirecrawlApp from '@mendable/firecrawl-js';
import NodeCache from 'node-cache';

const API_KEY = process.env.FIRECRAWL_API_KEY;
if (!API_KEY) {
  throw new Error('FIRECRAWL_API_KEY not set in env');
}

const firecrawlApp = new FirecrawlApp({ apiKey: API_KEY });

// initializing cache: TTL in seconds, ie, 3600 is 1 hour.
// checking environment variable or default:
const CACHE_TTL_SECONDS = process.env.FIRECRAWL_CACHE_TTL
  ? Number(process.env.FIRECRAWL_CACHE_TTL)
  : 3600;
const cache = new NodeCache({ stdTTL: CACHE_TTL_SECONDS, checkperiod: CACHE_TTL_SECONDS * 0.2 });

/**
 * Scrape a single URL via Firecrawl, requesting Markdown format.
 * Uses in-memory cache for repeated calls within TTL.
 * Returns the Markdown/plain text.
 */
export async function scrapeUrlViaFirecrawl(url: string): Promise<string> {
  const cacheKey = `scrape:${url}`;
  const cached = cache.get<string>(cacheKey);
  if (cached) {
    // logging that we returned cached
    console.log(`Cache hit for Firecrawl URL: ${url}`);
    return cached;
  }
  console.log(`Cache miss for Firecrawl URL: ${url}, fetching...`);
  const scrapeResponse = await firecrawlApp.scrapeUrl(url, {
    formats: ['markdown'],
  });
  if (!scrapeResponse.success) {
    throw new Error(`Firecrawl scrapeUrl failed for ${url}: ${scrapeResponse.error || 'unknown error'}`);
  }
  // the firecrawl api has a property `markdown`.
  let markdownText: string | undefined;
  if (typeof (scrapeResponse as any).markdown === 'string') {
    markdownText = (scrapeResponse as any).markdown;
  } else {
    // pick first string field
    for (const key of Object.keys(scrapeResponse)) {
      const val = (scrapeResponse as any)[key];
      if (typeof val === 'string' && val.length > 0) {
        markdownText = val;
        break;
      }
    }
  }
  if (markdownText === undefined) {
    throw new Error(`Firecrawl scrapeUrl returned no markdown content for ${url}`);
  }
  // store it in cache
  cache.set(cacheKey, markdownText);
  return markdownText;
}
