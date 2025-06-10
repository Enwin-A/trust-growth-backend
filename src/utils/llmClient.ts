import OpenAI from 'openai';
import { splitTextIntoChunks } from './textUtils';
import { logChunkResult, logMessage } from './logger';

const apiKey = process.env.OPENAI_API_KEY;
if (!apiKey) {
  throw new Error('OPENAI_API_KEY not set');
}
const openai = new OpenAI({ apiKey });

/**
 * Remove Markdown code fences (``` or ```json) from a raw response string.
 */
function stripCodeFences(raw: string): string {
  let s = raw.trim();
  // here if starts and ends with triple backticks, remove fences
  if (s.startsWith('```') && s.endsWith('```')) {
    const lines = s.split('\n');
    // we remove first line if it contains ```
    if (/^```/.test(lines[0])) {
      lines.shift();
    }
    // Remove last line if it's ```
    if (lines.length > 0 && lines[lines.length - 1].trim() === '```') {
      lines.pop();
    }
    s = lines.join('\n').trim();
  }
  return s;
}

/** Returns raw and parsed result for a Trust chunk */
async function scoreTrustChunk(text: string): Promise<{ raw: string; parsed: { score: number; justification: string } }> {
  const prompt = `
You are evaluating a company's annual report excerpt for Transparency.
On a scale from 0 to 100, how openly does the company discuss its challenges and risks?
Respond ONLY in JSON: { "score": <int 0-100>, "justification": "<brief explanation>" }.
Excerpt:
"""${text}"""
`;
  const resp = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.3,
  });
  let raw = resp.choices?.[0]?.message?.content ?? '';
  raw = raw.trim();
  const cleaned = stripCodeFences(raw);
  let parsed: { score: number; justification: string };
  try {
    parsed = JSON.parse(cleaned);
    parsed.score = Number(parsed.score);
  } catch {
    throw new Error(`Invalid JSON from LLM for trust chunk: ${cleaned}`);
  }
  return { raw, parsed };
}

/** Returns raw and parsed result for a Growth chunk */
async function scoreGrowthChunk(text: string): Promise<{ raw: string; parsed: { score: number; justification: string } }> {
  const prompt = `
You are evaluating a company's communications excerpt for Differentiation.
On a scale from 0 to 100, how clear and strong is its unique value proposition?
Respond ONLY in JSON: { "score": <int 0-100>, "justification": "<brief explanation>" }.
Excerpt:
"""${text}"""
`;
  const resp = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.3,
  });
  let raw = resp.choices?.[0]?.message?.content ?? '';
  raw = raw.trim();
  const cleaned = stripCodeFences(raw);
  let parsed: { score: number; justification: string };
  try {
    parsed = JSON.parse(cleaned);
    parsed.score = Number(parsed.score);
  } catch {
    throw new Error(`Invalid JSON from LLM for growth chunk: ${cleaned}`);
  }
  return { raw, parsed };
}

/**
 * Score Trust by chunking. Returns aggregated score and array of chunk justifications.
 * Logs each chunk if runId provided.
 */
export async function scoreTrust(
  text: string,
  runId?: string
): Promise<{ score: number; justifications: string[] }> {
  const chunks = splitTextIntoChunks(text, 8000);
  const results: { score: number; justification: string }[] = [];
  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    try {
      const { raw, parsed } = await scoreTrustChunk(chunk);
      if (runId) {
        await logChunkResult(runId, 'trust', i, chunk, raw, parsed);
      }
      results.push(parsed);
    } catch (err) {
      const errMsg = (err as Error).message;
      if (runId) {
        await logChunkResult(runId, 'trust', i, chunk, `Error: ${errMsg}`, undefined);
      }
      console.warn('Trust chunk error:', errMsg);
    }
  }
  if (results.length === 0) {
    return { score: 0, justifications: [] };
  }
  const avg = Math.round(results.reduce((sum, r) => sum + r.score, 0) / results.length);
  const justifications = results.map(r => r.justification);
  return { score: avg, justifications };
}

/**
 * Score Growth by chunking. Returns aggregated score and array of chunk justifications.
 * Logs each chunk if runId provided.
 */
export async function scoreGrowth(
  text: string,
  runId?: string
): Promise<{ score: number; justifications: string[] }> {
  const chunks = splitTextIntoChunks(text, 8000);
  const results: { score: number; justification: string }[] = [];
  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    try {
      const { raw, parsed } = await scoreGrowthChunk(chunk);
      if (runId) {
        await logChunkResult(runId, 'growth', i, chunk, raw, parsed);
      }
      results.push(parsed);
    } catch (err) {
      const errMsg = (err as Error).message;
      if (runId) {
        await logChunkResult(runId, 'growth', i, chunk, `Error: ${errMsg}`, undefined);
      }
      console.warn('Growth chunk error:', errMsg);
    }
  }
  if (results.length === 0) {
    return { score: 0, justifications: [] };
  }
  const avg = Math.round(results.reduce((sum, r) => sum + r.score, 0) / results.length);
  const justifications = results.map(r => r.justification);
  return { score: avg, justifications };
}

/**
 * Summarize overall Trust insights given aggregated score and chunk-level justifications.
 * Returns a JSON string: { overallJustification: string, recommendations: string[] }.
 */
export async function summarizeTrustInsights(
  aggregatedScore: number,
  chunkJustifications: string[],
  runId?: string
): Promise<string> {
  const maxJustificationsToInclude = 10;
  const justificationsToUse = chunkJustifications.slice(0, maxJustificationsToInclude);
  const justifText = justificationsToUse
    .map((j, idx) => `- Chunk ${idx + 1}: ${j}`)
    .join('\n');
  const omittedCount = chunkJustifications.length - justificationsToUse.length;
  const omittedNote = omittedCount > 0 ? `\n...and ${omittedCount} more observations omitted for brevity.` : '';

  const prompt = `
You are an expert business consultant. A company's Transparency (Trust) has been scored ${aggregatedScore}/100 based on analysis of its annual report excerpts. Here are key observations from different sections:
${justifText}${omittedNote}

Based on these observations and the score, provide:
1. A concise overall justification paragraph explaining why the Trust score is at this level.
2. Specific actionable recommendations for improving transparency in communications, investor relations, or marketing (e.g., what topics or data to disclose more openly).
Respond in JSON with shape:
{
  "overallJustification": "<concise paragraph>",
  "recommendations": ["<rec 1>", "<rec 2>", ...]
}
Only respond with valid JSON.
`;
  try {
    const resp = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.3,
    });
    let raw = resp.choices?.[0]?.message?.content ?? '';
    raw = raw.trim();
    raw = stripCodeFences(raw);
    if (runId) {
      // log raw summary response
      await logMessage(runId, `Trust summary raw response:\n${raw}`);
    }
    const parsed = JSON.parse(raw);
    if (
      typeof parsed.overallJustification === 'string' &&
      Array.isArray(parsed.recommendations)
    ) {
      // outputing formated json
      return JSON.stringify(parsed, null, 2);
    } else {
      throw new Error(`Unexpected JSON shape for Trust summary: ${raw}`);
    }
  } catch (err) {
    console.warn('Error summarizing Trust insights:', (err as Error).message);
    const fallback = `Trust score is ${aggregatedScore}/100. Observations: ${justificationsToUse.join(' | ')}${omittedNote}`;
    return JSON.stringify(
      { overallJustification: fallback, recommendations: [] },
      null,
      2
    );
  }
}

/**
 * Summarize overall Growth insights given aggregated score and chunk-level justifications.
 * Returns a JSON string: { overallJustification: string, recommendations: string[] }.
 */
export async function summarizeGrowthInsights(
  aggregatedScore: number,
  chunkJustifications: string[],
  runId?: string
): Promise<string> {
  const maxJustificationsToInclude = 10;
  const justificationsToUse = chunkJustifications.slice(0, maxJustificationsToInclude);
  const justifText = justificationsToUse
    .map((j, idx) => `- Chunk ${idx + 1}: ${j}`)
    .join('\n');
  const omittedCount = chunkJustifications.length - justificationsToUse.length;
  const omittedNote = omittedCount > 0 ? `\n...and ${omittedCount} more observations omitted for brevity.` : '';

  const prompt = `
You are an expert marketing and strategy consultant. A company's Differentiation (Growth) has been scored ${aggregatedScore}/100 based on analysis of its communications and web content. Here are key observations from different sections:
${justifText}${omittedNote}

Based on these observations and the score, provide:
1. A concise overall justification paragraph explaining why the Growth score is at this level.
2. Specific actionable recommendations for strengthening differentiation and marketing positioning (e.g., messaging focus, channels, partnerships).
Respond in JSON with shape:
{
  "overallJustification": "<concise paragraph>",
  "recommendations": ["<rec 1>", "<rec 2>", ...]
}
Only respond with valid JSON.
`;
  try {
    const resp = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.3,
    });
    let raw = resp.choices?.[0]?.message?.content ?? '';
    raw = raw.trim();
    raw = stripCodeFences(raw);
    if (runId) {
      await logMessage(runId, `Growth summary raw response:\n${raw}`);
    }
    const parsed = JSON.parse(raw);
    if (
      typeof parsed.overallJustification === 'string' &&
      Array.isArray(parsed.recommendations)
    ) {
      return JSON.stringify(parsed, null, 2);
    } else {
      throw new Error(`Unexpected JSON shape for Growth summary: ${raw}`);
    }
  } catch (err) {
    console.warn('Error summarizing Growth insights:', (err as Error).message);
    const fallback = `Growth score is ${aggregatedScore}/100. Observations: ${justificationsToUse.join(' | ')}${omittedNote}`;
    return JSON.stringify(
      { overallJustification: fallback, recommendations: [] },
      null,
      2
    );
  }
}
