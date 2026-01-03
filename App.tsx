import React, { useState } from 'react';
import { BookOpen, AlertTriangle, ScanEye, Library, Plus, Trash2, Check, ChevronDown } from 'lucide-react';
import { Chapter, AnalysisType, AppStep, BookSession } from './types';
import { extractTextFromPDF, findChapterText, convertFileToBase64 } from './services/pdfService';
import { identifyChapters, analyzeChapterContent } from './services/geminiService';
import { FileUpload } from './components/FileUpload';
import { ChapterList } from './components/ChapterList';
import { AnalysisView } from './components/AnalysisView';

export default function App() {
  // Session Management
  const [sessions, setSessions] = useState<BookSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [isLibraryOpen, setIsLibraryOpen] = useState(false);

  // View State (Derived or Active)
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

      // Determine mode
      let finalIsScanned = isScanned;
      if (isScanned) {
        console.log("Scanned document detected. Switching to Visual OCR mode.");
      } else if (text.length < 500) {
        finalIsScanned = true;
      }
      setIsScannedMode(finalIsScanned);

      // 3. Identify Chapters
      const identifiedChapters = await identifyChapters(
        finalIsScanned ? '' : text, 
        finalIsScanned ? base64 : undefined
      );

      if (identifiedChapters.length === 0) {
        throw new Error("Could not identify chapters. Try a different book.");
      }
      
      // 4. Create and Store Session
      const newSession: BookSession = {
        id: Date.now().toString(),
        fileName: file.name,
        uploadTimestamp: Date.now(),
        chapters: identifiedChapters,
        pdfText: text,
        pdfBase64: base64,
        isScannedMode: finalIsScanned
      };

      setSessions(prev => [newSession, ...prev]); // Add to top
      loadSession(newSession);
      
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Failed to process the book.");
      setLoading(false);
    }
  };

  const loadSession = (session: BookSession) => {
    setActiveSessionId(session.id);
    setPdfText(session.pdfText);
    setPdfBase64(session.pdfBase64);
    setIsScannedMode(session.isScannedMode);
    setChapters(session.chapters);
    
    // Reset view specific states
    setSelectedChapter(null);
    setCurrentAnalysis('');
    setStep('chapters');
    setError('');
    setLoading(false);
    setIsLibraryOpen(false);
  };

  const handleSwitchSession = (sessionId: string) => {
    const session = sessions.find(s => s.id === sessionId);
    if (session) {
      loadSession(session);
    }
  };

  const removeSession = (e: React.MouseEvent, sessionId: string) => {
    e.stopPropagation();
    const newSessions = sessions.filter(s => s.id !== sessionId);
    setSessions(newSessions);
    
    if (sessionId === activeSessionId) {
      if (newSessions.length > 0) {
        loadSession(newSessions[0]);
      } else {
        handleUploadNew(); // No books left, go to upload
      }
    }
  };

  const handleUploadNew = () => {
    setStep('upload');
    setError('');
    setActiveSessionId(null);
    setSelectedChapter(null);
    // We don't clear sessions here, just the current view to allow new upload
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
        const currentIndex = chapters.findIndex(c => c.number === chapter.number && c.title === chapter.title);
        const nextChapter = currentIndex >= 0 && currentIndex < chapters.length - 1 
          ? chapters[currentIndex + 1] 
          : null;

        chapterContent = findChapterText(pdfText, chapter.title, nextChapter ? nextChapter.title : null);
        
        if (!chapterContent || chapterContent.length < 200) {
           console.warn("Could not isolate substantial chapter text. Falling back to Full PDF Visual Analysis.");
           useFullPdfFallback = true;
           chapterContent = null;
        }
      }

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
      setStep('chapters');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 text-gray-900 font-sans pb-20">
      
      {/* Navbar */}
      <nav className="bg-white border-b border-gray-200 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <div className="flex items-center gap-2 cursor-pointer" onClick={() => sessions.length > 0 ? loadSession(sessions[0]) : handleUploadNew()}>
              <div className="bg-indigo-600 p-2 rounded-lg">
                <BookOpen className="w-5 h-5 text-white" />
              </div>
              <span className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-indigo-700 to-indigo-500">
                BookMind
              </span>
            </div>
            
            <div className="flex items-center gap-4">
              {/* Library Dropdown */}
              {sessions.length > 0 && (
                <div className="relative">
                  <button 
                    onClick={() => setIsLibraryOpen(!isLibraryOpen)}
                    className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-gray-600 hover:text-indigo-600 bg-gray-50 hover:bg-indigo-50 rounded-lg transition-colors border border-gray-200"
                  >
                    <Library className="w-4 h-4" />
                    <span className="hidden sm:inline">My Library</span>
                    <span className="bg-gray-200 text-gray-700 text-xs py-0.5 px-1.5 rounded-full">{sessions.length}</span>
                    <ChevronDown className={`w-3 h-3 transition-transform ${isLibraryOpen ? 'rotate-180' : ''}`} />
                  </button>

                  {isLibraryOpen && (
                    <>
                      <div className="fixed inset-0 z-10" onClick={() => setIsLibraryOpen(false)} />
                      <div className="absolute right-0 mt-2 w-72 bg-white rounded-xl shadow-xl border border-gray-100 z-20 py-2 animate-in fade-in zoom-in-95 duration-200">
                        <div className="px-4 py-2 border-b border-gray-100 mb-1">
                          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Active Books</h3>
                        </div>
                        <div className="max-h-[300px] overflow-y-auto">
                          {sessions.map((s) => (
                            <div 
                              key={s.id}
                              onClick={() => loadSession(s)}
                              className={`flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-gray-50 transition-colors ${activeSessionId === s.id ? 'bg-indigo-50/50' : ''}`}
                            >
                              <div className="flex items-center gap-3 overflow-hidden">
                                {activeSessionId === s.id ? (
                                  <div className="w-1.5 h-1.5 rounded-full bg-indigo-600 flex-shrink-0" />
                                ) : (
                                  <div className="w-1.5 h-1.5 rounded-full bg-gray-300 flex-shrink-0" />
                                )}
                                <div className="truncate">
                                  <p className={`text-sm font-medium truncate ${activeSessionId === s.id ? 'text-indigo-900' : 'text-gray-700'}`}>
                                    {s.fileName}
                                  </p>
                                  <p className="text-xs text-gray-400">
                                    {new Date(s.uploadTimestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})} • {s.chapters.length} Ch
                                  </p>
                                </div>
                              </div>
                              <button 
                                onClick={(e) => removeSession(e, s.id)}
                                className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          ))}
                        </div>
                        <div className="border-t border-gray-100 mt-1 pt-1 px-2">
                           <button 
                             onClick={() => {
                               handleUploadNew();
                               setIsLibraryOpen(false);
                             }}
                             className="w-full flex items-center justify-center gap-2 p-2 text-sm text-indigo-600 hover:bg-indigo-50 rounded-lg font-medium transition-colors"
                           >
                             <Plus className="w-4 h-4" />
                             Add New Book
                           </button>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              )}

              {/* Status Indicators & Standard Actions */}
              {isScannedMode && activeSessionId && (
                 <div className="hidden md:flex items-center gap-1 px-3 py-1 bg-amber-50 text-amber-700 rounded-full text-xs font-medium border border-amber-200" title="Using Visual AI Analysis for scanned document">
                   <ScanEye className="w-3 h-3" />
                   <span>Enhanced OCR</span>
                 </div>
               )}
            </div>
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
            <div className="flex flex-col items-center justify-center min-h-[60vh] animate-in fade-in">
              <div className="text-center mb-10 space-y-4">
                 <h1 className="text-4xl md:text-5xl font-extrabold text-gray-900 tracking-tight">
                   Understand any book in <span className="text-indigo-600">seconds</span>.
                 </h1>
                 <p className="text-lg text-gray-600 max-w-2xl mx-auto">
                   Upload a PDF to your library. Our AI identifies chapters and provides standard, detailed, insight-driven, or critical analyses tailored to your needs.
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
                onReset={handleUploadNew}
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