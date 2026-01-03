import React, { useState } from 'react';
import { BookOpen, AlertTriangle, ScanEye } from 'lucide-react';
import { Chapter, AnalysisType, AppStep } from './types';
import { extractTextFromPDF, findChapterText, convertFileToBase64 } from './services/pdfService';
import { identifyChapters, analyzeChapterContent } from './services/geminiService';
import { FileUpload } from './components/FileUpload';
import { ChapterList } from './components/ChapterList';
import { AnalysisView } from './components/AnalysisView';

export default function App() {
  const [step, setStep] = useState<AppStep>('upload');
  const [pdfText, setPdfText] = useState<string>('');
  const [pdfBase64, setPdfBase64] = useState<string>('');
  const [isScannedMode, setIsScannedMode] = useState(false);
  
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [selectedChapter, setSelectedChapter] = useState<Chapter | null>(null);
  const [currentAnalysis, setCurrentAnalysis] = useState<string>('');
  const [currentAnalysisType, setCurrentAnalysisType] = useState<AnalysisType>(AnalysisType.STANDARD);
  
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleFileSelect = async (file: File) => {
    setLoading(true);
    setError('');
    setIsScannedMode(false);
    
    try {
      // 1. Prepare Base64 (always needed for fallback or scanned mode)
      const base64 = await convertFileToBase64(file);
      setPdfBase64(base64);

      // 2. Try Text Extraction
      const { text, isScanned } = await extractTextFromPDF(file);
      setPdfText(text);

      if (isScanned) {
        setIsScannedMode(true);
        console.log("Scanned document detected. Switching to Visual OCR mode.");
      } else if (text.length < 500) {
        // Double check: if text is extremely short but didn't trigger heuristic, force scanned mode
        setIsScannedMode(true);
      }

      // 3. Identify Chapters
      // We pass both text and base64. The service decides which to use based on isScanned logic or availability
      const identifiedChapters = await identifyChapters(
        isScanned ? '' : text, 
        isScanned ? base64 : undefined
      );

      if (identifiedChapters.length === 0) {
        throw new Error("Could not identify chapters. Try a different book.");
      }
      
      setChapters(identifiedChapters);
      setStep('chapters');
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Failed to process the book.");
    } finally {
      setLoading(false);
    }
  };

  const handleChapterAnalysis = async (chapter: Chapter, type: AnalysisType) => {
    setSelectedChapter(chapter);
    setCurrentAnalysisType(type);
    setStep('analysis');
    setLoading(true);
    setCurrentAnalysis(''); 

    try {
      let chapterContent: string | null = null;
      let useFullPdfFallback = isScannedMode;

      if (!isScannedMode) {
        // Standard Text Mode
        // Find the next chapter to determine where the text ends
        const currentIndex = chapters.findIndex(c => c.number === chapter.number && c.title === chapter.title);
        const nextChapter = currentIndex >= 0 && currentIndex < chapters.length - 1 
          ? chapters[currentIndex + 1] 
          : null;

        // Extract specific content
        chapterContent = findChapterText(pdfText, chapter.title, nextChapter ? nextChapter.title : null);
        
        // If specific extraction fails, we might still want to try the "Text Context" fallback first
        // But if that fails too, we can fallback to the PDF Visual mode
        if (!chapterContent || chapterContent.length < 200) {
           console.warn("Could not isolate substantial chapter text. Falling back to Full PDF Visual Analysis.");
           useFullPdfFallback = true;
           chapterContent = null;
        }
      }

      // Analyze with Gemini
      // We pass pdfBase64 even if we have text, so the service can fallback if the text is deemed insufficient internally
      const result = await analyzeChapterContent(
        chapter.title, 
        chapterContent, 
        type, 
        pdfBase64 
      );

      setCurrentAnalysis(result);
    } catch (err: any) {
      console.error(err);
      setError("Failed to generate analysis.");
      setStep('chapters'); // Go back on error
    } finally {
      setLoading(false);
    }
  };

  const handleReset = () => {
    setPdfText('');
    setPdfBase64('');
    setChapters([]);
    setSelectedChapter(null);
    setCurrentAnalysis('');
    setStep('upload');
    setError('');
    setIsScannedMode(false);
  };

  return (
    <div className="min-h-screen bg-slate-50 text-gray-900 font-sans pb-20">
      
      {/* Navbar */}
      <nav className="bg-white border-b border-gray-200 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <div className="flex items-center gap-2 cursor-pointer" onClick={handleReset}>
              <div className="bg-indigo-600 p-2 rounded-lg">
                <BookOpen className="w-5 h-5 text-white" />
              </div>
              <span className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-indigo-700 to-indigo-500">
                BookMind
              </span>
            </div>
            {step !== 'upload' && (
              <div className="flex items-center gap-4">
                 {isScannedMode && (
                   <div className="hidden md:flex items-center gap-1 px-3 py-1 bg-amber-50 text-amber-700 rounded-full text-xs font-medium border border-amber-200" title="Using Visual AI Analysis for scanned document">
                     <ScanEye className="w-3 h-3" />
                     <span>Enhanced OCR Mode</span>
                   </div>
                 )}
                 <button onClick={handleReset} className="text-sm text-gray-500 hover:text-indigo-600 font-medium">
                   Upload New
                 </button>
              </div>
            )}
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-10">
        
        {/* Error Banner */}
        {error && (
          <div className="mb-8 bg-red-50 border-l-4 border-red-500 p-4 rounded-r-lg flex items-start justify-between animate-in fade-in slide-in-from-top-2">
            <div className="flex">
              <AlertTriangle className="h-5 w-5 text-red-500 mr-3 mt-0.5" />
              <div>
                <h3 className="text-sm font-medium text-red-800">Error Encountered</h3>
                <div className="mt-1 text-sm text-red-700">{error}</div>
              </div>
            </div>
            <button onClick={() => setError('')} className="text-red-500 hover:text-red-700 font-bold">✕</button>
          </div>
        )}

        {/* Content Switcher */}
        <div className="transition-all duration-500 ease-in-out">
          {step === 'upload' && (
            <div className="flex flex-col items-center justify-center min-h-[60vh]">
              <div className="text-center mb-10 space-y-4">
                 <h1 className="text-4xl md:text-5xl font-extrabold text-gray-900 tracking-tight">
                   Understand any book in <span className="text-indigo-600">seconds</span>.
                 </h1>
                 <p className="text-lg text-gray-600 max-w-2xl mx-auto">
                   Upload a PDF. Our AI identifies chapters and provides standard, detailed, insight-driven, or critical analyses tailored to your needs.
                 </p>
              </div>
              <FileUpload 
                onFileSelect={handleFileSelect} 
                isLoading={loading} 
                error={error} 
              />
            </div>
          )}

          {step === 'chapters' && (
            <>
              {isScannedMode && (
                <div className="mb-6 p-4 bg-amber-50 border border-amber-200 rounded-xl flex items-center gap-3 animate-in fade-in">
                  <ScanEye className="w-5 h-5 text-amber-600" />
                  <div>
                    <h4 className="text-sm font-bold text-amber-800">Scanned Document Detected</h4>
                    <p className="text-xs text-amber-700">We are using Visual AI to read this document. Analysis might take slightly longer.</p>
                  </div>
                </div>
              )}
              <ChapterList 
                chapters={chapters} 
                onChapterSelect={handleChapterAnalysis}
                onReset={handleReset}
                activeChapter={selectedChapter}
              />
            </>
          )}

          {step === 'analysis' && selectedChapter && (
            <AnalysisView 
              chapter={selectedChapter}
              analysis={currentAnalysis}
              type={currentAnalysisType}
              isLoading={loading}
              onBack={() => setStep('chapters')}
              onRegenerate={() => handleChapterAnalysis(selectedChapter, currentAnalysisType)}
            />
          )}
        </div>
      </main>
    </div>
  );
}