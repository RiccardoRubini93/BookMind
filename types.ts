export interface Chapter {
  number: string;
  title: string;
  description: string;
}

export enum AnalysisType {
  STANDARD = 'standard',
  DETAILED = 'detailed',
  INSIGHTS = 'insights',
  CRITICAL = 'critical',
}

export type AppStep = 'upload' | 'processing' | 'chapters' | 'analysis';

export interface AnalysisConfig {
  type: AnalysisType;
  label: string;
  description: string;
  icon: string;
}

export interface BookSession {
  id: string;
  fileName: string;
  uploadTimestamp: number;
  chapters: Chapter[];
  pdfText: string;
  pdfBase64: string;
  isScannedMode: boolean;
}