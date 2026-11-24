/**
 * ocrAnalysisService.js
 * DEPRECATED & EXCISED under Niyantran Employee Monitoring V2 Privacy Boundaries.
 * Optical Character Recognition (OCR) surveillance has been permanently removed.
 */

class OCRAnalysisService {
  constructor() {
    this.ocrWorker = null;
  }

  async initializeOCR() {
    return null;
  }

  async extractTextFromScreenshot() {
    return { text: '', confidence: 0 };
  }

  async analyzeScreenshotWithOCR() {
    return {
      isAnalyzing: false,
      text: '',
      confidence: 0,
      classification: 'disabled',
      reason: 'OCR surveillance permanently eradicated in Monitoring V2'
    };
  }

  getOCRStats() {
    return {
      status: 'permanently_disabled',
      totalAnalyzed: 0,
      averageConfidence: 0
    };
  }

  async cleanup() {}
}

module.exports = new OCRAnalysisService();
