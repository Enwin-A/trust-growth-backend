import pdfParse from 'pdf-parse';

/**
 * this extracts text from a PDF Buffer.
 */
export async function extractTextFromPdf(buffer: Buffer): Promise<string> {
  const data = await pdfParse(buffer);
  return data.text; // raw extracted text
}
