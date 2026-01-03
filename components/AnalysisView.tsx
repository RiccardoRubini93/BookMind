import React, { useRef, useState, useEffect, useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import { Chapter, AnalysisType } from '../types';
import { ArrowLeft, RefreshCw, Loader2, Play, Pause, Square, Volume2, RotateCcw, RotateCw, SkipBack, SkipForward, Image as ImageIcon } from 'lucide-react';
import { generateSpeech, generateSlide } from '../services/geminiService';

interface AnalysisViewProps {
  chapter: Chapter;
  analysis: string;
  type: AnalysisType;
  isLoading: boolean;
  onBack: () => void;
  onRegenerate: () => void;
}

// --- Audio Helpers ---

function decodeBase64(base64: string) {
  const binaryString = atob(base64);
  const len = binaryString.length;
  // Ensure we have an even number of bytes for Int16 PCM
  const safeLen = len - (len % 2);
  const bytes = new Uint8Array(safeLen);
  for (let i = 0; i < safeLen; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

// Gemini returns raw PCM data (Int16, 24kHz, Mono) which does not have WAV/MP3 headers.
// The browser's native decodeAudioData cannot handle raw PCM, so we must decode it manually.
async function decodeAudioData(
  data: Uint8Array,
  ctx: AudioContext,
): Promise<AudioBuffer> {
  const sampleRate = 24000;
  const numChannels = 1;
  
  // Create Int16 view of the data
  // We use slice to ensure a fresh ArrayBuffer that is properly aligned if necessary
  const buffer = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
  const dataInt16 = new Int16Array(buffer);
  
  const frameCount = dataInt16.length / numChannels;
  const audioBuffer = ctx.createBuffer(numChannels, frameCount, sampleRate);

  for (let channel = 0; channel < numChannels; channel++) {
    const channelData = audioBuffer.getChannelData(channel);
    for (let i = 0; i < frameCount; i++) {
      // Normalize 16-bit integer (-32768 to 32767) to float range [-1.0, 1.0]
      channelData[i] = dataInt16[i * numChannels + channel] / 32768.0;
    }
  }
  
  return audioBuffer;
}

// Format seconds to MM:SS
const formatTime = (seconds: number) => {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
};

export const AnalysisView: React.FC<AnalysisViewProps> = ({ 
  chapter, 
  analysis, 
  type, 
  isLoading, 
  onBack,
  onRegenerate 
}) => {
  // Audio State
  const [isPlaying, setIsPlaying] = useState(false);
  const [isGeneratingAudio, setIsGeneratingAudio] = useState(false);
  const [audioBuffer, setAudioBuffer] = useState<AudioBuffer | null>(null);
  
  // Slide State
  const [slideImage, setSlideImage] = useState<string | null>(null);
  const [isGeneratingSlide, setIsGeneratingSlide] = useState(false);

  // Playback State
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  
  // Refs for Audio Engine
  const audioContextRef = useRef<AudioContext | null>(null);
  const sourceNodeRef = useRef<AudioBufferSourceNode | null>(null);
  const startTimeRef = useRef<number>(0); // When the *current source node* started playing relative to context time
  const pauseOffsetRef = useRef<number>(0); // How much audio we have already played (offset into buffer)
  const rafRef = useRef<number | null>(null); // RequestAnimationFrame ID

  // --- Content Segmentation for Highlighting ---
  
  // Split analysis into blocks for highlighting
  const contentBlocks = useMemo(() => {
    if (!analysis) return [];
    // Split by double newline to separate paragraphs/headers
    return analysis.split(/\n\n+/).filter(Boolean);
  }, [analysis]);

  // Calculate cumulative lengths to map time -> block
  const blockMap = useMemo(() => {
    const map: { endChar: number; index: number }[] = [];
    let totalChars = 0;
    contentBlocks.forEach((block, index) => {
      totalChars += block.length;
      map.push({ endChar: totalChars, index });
    });
    return { map, totalChars };
  }, [contentBlocks]);

  // Determine active block index based on playback progress
  const activeBlockIndex = useMemo(() => {
    if (duration === 0 || currentTime === 0) return -1;
    
    // Heuristic: Audio progress % roughly equals Text progress %
    const progress = currentTime / duration;
    const estimatedCharPosition = progress * blockMap.totalChars;
    
    // Find the block containing this char
    const active = blockMap.map.find(item => item.endChar >= estimatedCharPosition);
    return active ? active.index : -1;
  }, [currentTime, duration, blockMap]);

  // --- Effects ---

  useEffect(() => {
    return () => {
      stopAudio();
      if (audioContextRef.current) {
        audioContextRef.current.close();
      }
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  useEffect(() => {
    stopAudio();
    setAudioBuffer(null);
    setCurrentTime(0);
    setDuration(0);
    // Reset slide on new analysis
    setSlideImage(null);
    setIsGeneratingSlide(false);
  }, [analysis]);

  // --- Audio Logic ---

  const initAudioContext = () => {
    if (!audioContextRef.current) {
      audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    return audioContextRef.current;
  };

  const updateProgress = () => {
    if (!audioContextRef.current || !isPlaying) return;
    
    // Current Time = Offset (where we started seeking) + (Current Ctx Time - Start Ctx Time)
    const elapsedSinceStart = audioContextRef.current.currentTime - startTimeRef.current;
    const actualTime = pauseOffsetRef.current + elapsedSinceStart;
    
    if (actualTime >= duration) {
      setCurrentTime(duration);
      setIsPlaying(false);
      pauseOffsetRef.current = 0;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    } else {
      setCurrentTime(actualTime);
      rafRef.current = requestAnimationFrame(updateProgress);
    }
  };

  useEffect(() => {
    if (isPlaying) {
      rafRef.current = requestAnimationFrame(updateProgress);
    } else if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
    }
  }, [isPlaying, duration]);

  const prepareAudio = async () => {
    setIsGeneratingAudio(true);
    try {
      const ctx = initAudioContext();
      if (ctx.state === 'suspended') await ctx.resume();

      if (!audioBuffer) {
        const base64Audio = await generateSpeech(analysis);
        const bytes = decodeBase64(base64Audio);
        const buffer = await decodeAudioData(bytes, ctx);
        setAudioBuffer(buffer);
        setDuration(buffer.duration);
        return { buffer, ctx };
      }
      return { buffer: audioBuffer, ctx };
    } catch (error) {
      console.error("Audio generation failed", error);
      alert("Could not generate audio. Please try again.");
      return null;
    } finally {
      setIsGeneratingAudio(false);
    }
  };

  const playAudio = async (offset = pauseOffsetRef.current) => {
    const data = await prepareAudio();
    if (!data) return;

    const { buffer, ctx } = data;

    if (sourceNodeRef.current) {
      sourceNodeRef.current.disconnect();
    }

    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(ctx.destination);
    
    const safeOffset = Math.min(Math.max(0, offset), buffer.duration);
    
    source.start(0, safeOffset);
    
    startTimeRef.current = ctx.currentTime;
    pauseOffsetRef.current = safeOffset;
    sourceNodeRef.current = source;
    
    setIsPlaying(true);
  };

  const pauseAudio = () => {
    if (sourceNodeRef.current && audioContextRef.current) {
      sourceNodeRef.current.stop();
      const elapsed = audioContextRef.current.currentTime - startTimeRef.current;
      pauseOffsetRef.current = pauseOffsetRef.current + elapsed;
      setIsPlaying(false);
    }
  };

  const stopAudio = () => {
    if (sourceNodeRef.current) {
      try { sourceNodeRef.current.stop(); } catch(e){}
      sourceNodeRef.current.disconnect();
      sourceNodeRef.current = null;
    }
    pauseOffsetRef.current = 0;
    setCurrentTime(0);
    setIsPlaying(false);
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
  };

  const seekAudio = (time: number) => {
    const wasPlaying = isPlaying;
    if (sourceNodeRef.current) {
      try { sourceNodeRef.current.stop(); } catch(e){}
    }
    pauseOffsetRef.current = time;
    setCurrentTime(time);
    if (wasPlaying) {
      playAudio(time);
    }
  };

  const handleSeekSlider = (e: React.ChangeEvent<HTMLInputElement>) => {
    const time = parseFloat(e.target.value);
    seekAudio(time);
  };

  const skip = (seconds: number) => {
    if (!audioBuffer) return;
    const newTime = Math.min(Math.max(0, currentTime + seconds), duration);
    seekAudio(newTime);
  };

  // --- Slide Logic ---

  const handleGenerateSlide = async () => {
    if (slideImage) return; // Already have one
    setIsGeneratingSlide(true);
    try {
      const base64 = await generateSlide(chapter.title, analysis);
      setSlideImage(base64);
    } catch (e) {
      alert("Failed to generate slide. Please try again.");
    } finally {
      setIsGeneratingSlide(false);
    }
  };

  // --- Rendering ---

  const markdownComponents = {
    h1: ({node, ...props}: any) => <h1 className="text-2xl font-extrabold text-indigo-950 mb-4" {...props} />,
    h2: ({node, ...props}: any) => <h2 className="text-xl font-bold text-gray-900 mt-4 mb-2" {...props} />,
    h3: ({node, ...props}: any) => <h3 className="text-lg font-semibold text-gray-800 mt-3 mb-1" {...props} />,
    p: ({node, ...props}: any) => <p className="mb-3 leading-relaxed text-gray-700" {...props} />,
    ul: ({node, ...props}: any) => <ul className="list-disc list-outside ml-6 mb-3 space-y-1 text-gray-700" {...props} />,
    ol: ({node, ...props}: any) => <ol className="list-decimal list-outside ml-6 mb-3 space-y-1 text-gray-700" {...props} />,
    blockquote: ({node, ...props}: any) => <blockquote className="border-l-4 border-indigo-300 bg-indigo-50/50 pl-4 py-2 my-4 italic text-gray-700 rounded-r-lg" {...props} />,
  };

  if (isLoading) {
    return (
      <div className="max-w-3xl mx-auto text-center py-20">
        <div className="relative w-24 h-24 mx-auto mb-8">
          <div className="absolute inset-0 border-4 border-indigo-100 rounded-full"></div>
          <div className="absolute inset-0 border-4 border-indigo-600 rounded-full border-t-transparent animate-spin"></div>
          <div className="absolute inset-0 flex items-center justify-center">
            <RefreshCw className="w-8 h-8 text-indigo-600 animate-pulse" />
          </div>
        </div>
        <h3 className="text-2xl font-bold text-gray-900 mb-2">Analyzing Chapter...</h3>
        <p className="text-gray-500">Reading "{chapter.title}" and generating {type} analysis.</p>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto animate-in fade-in zoom-in-95 duration-300">
      {/* Nav */}
      <button 
        onClick={onBack}
        className="group flex items-center text-sm font-medium text-gray-500 hover:text-indigo-600 mb-6 transition-colors"
      >
        <div className="p-1 rounded-full bg-gray-100 group-hover:bg-indigo-100 mr-2 transition-colors">
          <ArrowLeft className="w-4 h-4" />
        </div>
        Back to Chapters
      </button>

      <div className="bg-white rounded-3xl shadow-xl overflow-hidden border border-gray-100 relative">
        {/* Header */}
        <div className="bg-gradient-to-r from-slate-50 to-gray-50 border-b border-gray-100 p-8">
          <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-3 mb-3">
                <span className="px-3 py-1 bg-indigo-600 text-white text-xs font-bold uppercase tracking-wider rounded-full">
                  Chapter {chapter.number}
                </span>
                <span className="px-3 py-1 bg-white border border-gray-200 text-gray-600 text-xs font-bold uppercase tracking-wider rounded-full flex items-center gap-1">
                  {type} Analysis
                </span>
              </div>
              <h1 className="text-3xl font-bold text-gray-900 leading-tight">
                {chapter.title}
              </h1>
            </div>
            
            <div className="flex items-center gap-2">
              <button
                onClick={handleGenerateSlide}
                disabled={isGeneratingSlide || !!slideImage}
                className={`p-3 border rounded-xl transition-all shadow-sm ${
                  slideImage ? 'bg-indigo-50 border-indigo-200 text-indigo-600' : 'bg-white border-gray-200 text-gray-600 hover:border-indigo-300 hover:text-indigo-600'
                }`}
                title="Generate Visual Slide"
              >
                {isGeneratingSlide ? <Loader2 className="w-5 h-5 animate-spin" /> : <ImageIcon className="w-5 h-5" />}
              </button>
              <button
                onClick={onRegenerate}
                className="p-3 bg-white border border-gray-200 text-gray-600 rounded-xl hover:border-indigo-300 hover:text-indigo-600 transition-all shadow-sm"
                title="Regenerate Analysis"
              >
                <RefreshCw className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>

        {/* Player Bar (Sticky) */}
        <div className="sticky top-0 z-20 bg-white/95 backdrop-blur border-b border-gray-100 px-6 py-3 shadow-sm transition-all">
          <div className="flex flex-col gap-2">
             <div className="flex items-center justify-between gap-4">
                {/* Controls */}
                <div className="flex items-center gap-2">
                   {isGeneratingAudio ? (
                      <div className="flex items-center gap-2 px-4 py-2 bg-indigo-50 text-indigo-700 rounded-lg text-sm font-medium">
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Generating Audio...
                      </div>
                   ) : (
                      <>
                        <button 
                          onClick={() => skip(-10)} 
                          className="p-2 text-gray-500 hover:text-indigo-600 hover:bg-gray-100 rounded-full transition-colors"
                          disabled={!audioBuffer}
                        >
                           <RotateCcw className="w-5 h-5" />
                        </button>

                        <button
                          onClick={isPlaying ? pauseAudio : () => playAudio()}
                          className="w-12 h-12 flex items-center justify-center bg-indigo-600 text-white rounded-full hover:bg-indigo-700 shadow-lg hover:shadow-indigo-500/30 transition-all active:scale-95"
                        >
                          {isPlaying ? <Pause className="w-6 h-6 fill-current" /> : <Play className="w-6 h-6 fill-current ml-1" />}
                        </button>

                        <button 
                          onClick={() => skip(10)} 
                          className="p-2 text-gray-500 hover:text-indigo-600 hover:bg-gray-100 rounded-full transition-colors"
                          disabled={!audioBuffer}
                        >
                           <RotateCw className="w-5 h-5" />
                        </button>
                      </>
                   )}
                </div>

                {/* Scrubber */}
                <div className="flex-grow flex items-center gap-3">
                   <span className="text-xs font-mono text-gray-500 w-10 text-right">{formatTime(currentTime)}</span>
                   <input 
                      type="range" 
                      min="0" 
                      max={duration || 100} 
                      value={currentTime} 
                      onChange={handleSeekSlider}
                      disabled={!audioBuffer}
                      className="flex-grow h-1.5 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-indigo-600 hover:accent-indigo-500 transition-all"
                   />
                   <span className="text-xs font-mono text-gray-500 w-10">{formatTime(duration)}</span>
                </div>
             </div>
          </div>
        </div>
        
        {/* Slide Display Area */}
        { (slideImage || isGeneratingSlide) && (
          <div className="mx-8 md:mx-12 mt-8 rounded-xl overflow-hidden shadow-lg border border-gray-100 bg-gray-50 relative aspect-video group">
             {isGeneratingSlide ? (
                <div className="absolute inset-0 flex flex-col items-center justify-center text-gray-500 bg-gray-50">
                   <Loader2 className="w-8 h-8 animate-spin mb-3 text-indigo-600" />
                   <span className="text-sm font-medium">Designing Slide with Nano Banana...</span>
                </div>
             ) : (
               <>
                <img src={`data:image/png;base64,${slideImage}`} alt="Chapter Slide" className="w-full h-full object-cover" />
                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors pointer-events-none" />
               </>
             )}
          </div>
        )}

        {/* Content with Highlighting */}
        <div className="p-8 md:p-12 space-y-4">
          {contentBlocks.map((block, index) => {
             const isActive = isPlaying && index === activeBlockIndex;
             
             return (
               <div 
                  key={index} 
                  className={`
                    transition-all duration-500 ease-in-out px-4 py-2 rounded-lg -mx-4
                    ${isActive 
                       ? 'bg-indigo-50 border-l-4 border-indigo-400 shadow-sm scale-[1.01]' 
                       : 'border-l-4 border-transparent'
                    }
                  `}
               >
                 <ReactMarkdown components={markdownComponents}>
                   {block}
                 </ReactMarkdown>
               </div>
             );
          })}
        </div>
        
        {/* Footer actions */}
        <div className="bg-gray-50 px-8 py-6 border-t border-gray-100 flex justify-between items-center">
            <span className="text-sm text-gray-500">AI generated content may contain inaccuracies.</span>
            <button onClick={onBack} className="text-indigo-600 font-medium hover:underline">Read another chapter</button>
        </div>
      </div>
    </div>
  );
};