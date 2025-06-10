/**
 * Splits text into chunks of up to maxChars characters, trying to split at sentence boundaries.
 * Default maxChars = 8000 to stay within 4096 token context window for openai models when combined with prompt overhead.
 */
export function splitTextIntoChunks(text: string, maxChars = 8000): string[] {
  const chunks: string[] = [];
  let start = 0;
  const len = text.length;
  while (start < len) {
    let end = start + maxChars;
    if (end >= len) {
      chunks.push(text.slice(start).trim());
      break;
    }
    // we try to split at last . before end
    let splitAt = text.lastIndexOf('.', end);
    if (splitAt <= start) {
      // fallback, split at new line
      splitAt = text.lastIndexOf('\n', end);
    }
    if (splitAt <= start) {
      // no clean boundary, split at max chars
      splitAt = end;
    }
    const chunk = text.slice(start, splitAt + 1).trim();
    chunks.push(chunk);
    start = splitAt + 1;
  }
  return chunks.filter(c => c.length > 0);
}
