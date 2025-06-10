import { Router } from 'express';
import multer from 'multer';
import { extractTextFromPdf } from '../services/pdfServices';
import { scrapeUrlViaFirecrawl } from '../services/firecrawlClient';
import { scoreTrust, scoreGrowth, summarizeTrustInsights, summarizeGrowthInsights } from '../utils/llmClient';
import { logMessage } from '../utils/logger';
import crypto from 'crypto';

const upload = multer({ storage: multer.memoryStorage(), limits: { files: 5 } });
export const analyzeRouter = Router();


// this is the main route for analyzing a ticker with PDF files, mentions the workflow steps
analyzeRouter.post('/', upload.array('files', 5), async (req, res, next) => {
  // generating runId at start
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const runId = `${timestamp}_${crypto.randomUUID()}`;
  try {
    const ticker = String(req.body.ticker || '').toUpperCase();
    const pdfFiles = req.files as Express.Multer.File[];
    if (!ticker || !pdfFiles?.length) {
      await logMessage(runId, `Invalid request: missing ticker or PDF files.`);
      return res.status(400).json({ error: 'ticker + at least 1 PDF file required' });
    }
    await logMessage(runId, `Starting analysis for ticker=${ticker}`);

    // 1. extract PDF texts
    await logMessage(runId, `Beginning PDF extraction for ${pdfFiles.length} file(s)`);
    const pdfTexts: string[] = [];
    for (let i = 0; i < pdfFiles.length; i++) {
      const f = pdfFiles[i];
      try {
        const text = await extractTextFromPdf(f.buffer);
        await logMessage(runId, `Extracted PDF file ${i + 1}: ${text.length} chars`);
        pdfTexts.push(text);
      } catch (err) {
        const msg = (err as Error).message;
        await logMessage(runId, `Error extracting PDF file ${i + 1}: ${msg}`);
        throw err;
      }
    }
    const combinedPdfText = pdfTexts.join('\n\n');
    await logMessage(runId, `Combined PDF text length: ${combinedPdfText.length} chars`);

    // 2. urls per ticker (company)
    const urlMap: Record<string, string[]> = {
      'VOLV-B': [
        'https://www.volvogroup.com/en/about-us/strategy.html',
        'https://www.volvogroup.com/en/news-and-media.html',
        'https://www.google.com/finance/quote/VOLV-B:STO',
      ],
      'HM-B': [
        'https://hmgroup.com/media/news/',
        'https://www.google.com/finance/quote/HM-B:STO',
      ],
    };
    const urls = urlMap[ticker];
    if (!urls) {
      await logMessage(runId, `Unsupported ticker: ${ticker}`);
      return res.status(400).json({ error: 'Unsupported ticker' });
    }

    // 3. scraping via firecrawl
    await logMessage(runId, `Beginning scraping of ${urls.length} URL(s)`);
    const scrapedTexts: string[] = [];
    for (let i = 0; i < urls.length; i++) {
      const url = urls[i];
      await logMessage(runId, `Scraping URL ${i + 1}: ${url}`);
      try {
        const text = await scrapeUrlViaFirecrawl(url);
        await logMessage(runId, `Scraped URL ${i + 1}: ${text.length} chars`);
        if (text) scrapedTexts.push(text);
      } catch (err) {
        const msg = (err as Error).message;
        await logMessage(runId, `Error scraping URL ${i + 1}: ${msg}`);
      }
    }
    const combinedScrapeText = scrapedTexts.join('\n\n');
    await logMessage(runId, `Combined scraped text length: ${combinedScrapeText.length} chars`);

    // 4. score trust
    await logMessage(runId, `Beginning Trust scoring (Transparency)`);
    const trustResult = await scoreTrust(combinedPdfText, runId);
    await logMessage(runId, `Completed Trust scoring: score=${trustResult.score}`);

    // 5. summarize trust insights
    await logMessage(runId, `Beginning Trust summarization`);
    const trustSummaryJsonString = await summarizeTrustInsights(trustResult.score, trustResult.justifications, runId);
    let trustSummaryObj: { overallJustification: string; recommendations: string[] };
    try {
      trustSummaryObj = JSON.parse(trustSummaryJsonString);
    } catch {
      trustSummaryObj = { overallJustification: trustSummaryJsonString, recommendations: [] };
    }

    // 6. score growth
    await logMessage(runId, `Beginning Growth scoring (Differentiation)`);
    const growthResult = await scoreGrowth(combinedScrapeText, runId);
    await logMessage(runId, `Completed Growth scoring: score=${growthResult.score}`);

    // 7. summarize growth insights
    await logMessage(runId, `Beginning Growth summarization`);
    const growthSummaryJsonString = await summarizeGrowthInsights(growthResult.score, growthResult.justifications, runId);
    let growthSummaryObj: { overallJustification: string; recommendations: string[] };
    try {
      growthSummaryObj = JSON.parse(growthSummaryJsonString);
    } catch {
      growthSummaryObj = { overallJustification: growthSummaryJsonString, recommendations: [] };
    }

    // 8. summary line
    const summaryLine = `For ${ticker}: Trust=${trustResult.score}, Growth=${growthResult.score}.`;
    await logMessage(runId, `Summary: ${summaryLine}`);

    await logMessage(runId, `Analysis completed successfully`);

    // 9. return structured response including runId
    res.json({
      ticker,
      trustScore: trustResult.score,
      trustJustification: trustSummaryObj.overallJustification,
      trustRecommendations: trustSummaryObj.recommendations,
      growthScore: growthResult.score,
      growthJustification: growthSummaryObj.overallJustification,
      growthRecommendations: growthSummaryObj.recommendations,
      summary: summaryLine,
      runId,
    });
  } catch (err) {
    const msg = (err as Error).message;
    await logMessage(runId, `Analysis failed with error: ${msg}`);

    res.status(500).json({ error: msg, runId });
  }
});
