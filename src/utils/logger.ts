import fs from 'fs/promises';
import path from 'path';

/**
 * Ensures the logs directory exists, returns its path.
 */
async function ensureLogsDir(): Promise<string> {
  const logsDir = path.resolve(process.cwd(), 'logs');
  await fs.mkdir(logsDir, { recursive: true });
  return logsDir;
}

/**
 * This appends a timestamped message to the run log file.
 * @param runId Unique run identifier.
 * @param message Message to log.
 */
export async function logMessage(runId: string, message: string): Promise<void> {
  try {
    const logsDir = await ensureLogsDir();
    const filePath = path.join(logsDir, `${runId}.log`);
    const timestamp = new Date().toISOString();
    const entry = `[${timestamp}] ${message}\n`;
    await fs.appendFile(filePath, entry);
  } catch (err) {
    console.warn('Failed to write log message:', (err as Error).message);
  }
}

/**
 * logging the details of chunk scoring iteration.
 * Removes chunkText to a maximum length to avoid huge logs, but notes total length.
 */
export async function logChunkResult(
  runId: string,
  phase: 'trust' | 'growth',
  chunkIndex: number,
  chunkText: string,
  rawResponse: string,
  parsedResult?: { score: number; justification: string }
): Promise<void> {
  try {
    const logsDir = await ensureLogsDir();
    const filePath = path.join(logsDir, `${runId}.log`);
    const timestamp = new Date().toISOString();

    // Removes logged chunk text to avoid large logs, but notes actual length
    const maxLogChunkLength = 2000;
    const displayedChunk = chunkText.length > maxLogChunkLength
      ? chunkText.slice(0, maxLogChunkLength) + '...[truncated]'
      : chunkText;

    const header = `[${timestamp}] === ${phase.toUpperCase()} Chunk ${chunkIndex + 1} ===`;
    const chunkInfo = `Chunk text length: ${chunkText.length} chars (showing up to ${maxLogChunkLength}):\n${displayedChunk}`;
    const rawInfo = `Raw LLM response:\n${rawResponse}`;
    const parsedInfo = parsedResult
      ? `Parsed result: score=${parsedResult.score}, justification="${parsedResult.justification}"`
      : `Parsed result: <none or parse error>`;
    const entry = [header, chunkInfo, rawInfo, parsedInfo, ''].join('\n');
    await fs.appendFile(filePath, entry);
  } catch (err) {
    console.warn('Failed to write chunk log:', (err as Error).message);
  }
}
