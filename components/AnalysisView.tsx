import React, { useRef, useState, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import { Chapter, AnalysisType } from '../types';
import { ArrowLeft, RefreshCw, Loader2, Play, Pause, Square, Volume2 } from 'lucide-react';
import { generateSpeech } from '../services/geminiService';

interface AnalysisViewProps {
  chapter: Chapter;
  analysis: string;
  type: AnalysisType;
  isLoading: boolean;
  onBack: () => void;
  onRegenerate: () => void;
}

// Helpers for PCM decoding
function decodeBase64(base64: string) {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

async function decodeAudioData(
  data: Uint8Array,
  ctx: AudioContext,
  sampleRate: number,
  numChannels: number,
): Promise<AudioBuffer> {
  const dataInt16 = new Int16Array(data.buffer);
  const frameCount = dataInt16.length / numChannels;
  const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate);

  for (let channel = 0; channel < numChannels; channel++) {
    const channelData = buffer.getChannelData(channel);
    for (let i = 0; i < frameCount; i++) {
      channelData[i] = dataInt16[i * numChannels + channel] / 32768.0;
    }
  }
  return buffer;
}

export const AnalysisView: React.FC<AnalysisViewProps> = ({ 
  chapter, 
  analysis, 
  type, 
  isLoading, 
  onBack,
  onRegenerate 
}) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [isGeneratingAudio, setIsGeneratingAudio] = useState(false);
  const [audioCache, setAudioCache] = useState<AudioBuffer | null>(null);
  
  const audioContextRef = useRef<AudioContext | null>(null);
  const sourceNodeRef = useRef<AudioBufferSourceNode | null>(null);
  const startTimeRef = useRef<number>(0);
  const pausedAtRef = useRef<number>(0);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopAudioInternal();
      if (audioContextRef.current) {
        audioContextRef.current.close();
      }
    };
  }, []);

  // Reset audio when analysis content changes (e.g. regenerated)
  useEffect(() => {
    stopAudioInternal();
    setAudioCache(null);
  }, [analysis]);

  const stopAudioInternal = () => {
    if (sourceNodeRef.current) {
      try {
        sourceNodeRef.current.stop();
        sourceNodeRef.current.disconnect();
      } catch (e) {
        // Ignore errors
      }
      sourceNodeRef.current = null;
    }
    setIsPlaying(false);
    setIsPaused(false);
    pausedAtRef.current = 0;
  };

  const initAudioContext = () => {
    if (!audioContextRef.current) {
      audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({
        sampleRate: 24000 // Gemini TTS usually outputs 24kHz
      });
    }
    return audioContextRef.current;
  };

  const handlePlay = async () => {
    try {
      setIsGeneratingAudio(true);
      const ctx = initAudioContext();
      
      // Resume context if suspended (browser policy)
      if (ctx.state === 'suspended') {
        await ctx.resume();
      }

      let buffer = audioCache;

      // If no cached buffer, generate it
      if (!buffer) {
        const base64Audio = await generateSpeech(analysis);
        const bytes = decodeBase64(base64Audio);
        buffer = await decodeAudioData(bytes, ctx, 24000, 1);
        setAudioCache(buffer);
      }
      setIsGeneratingAudio(false);

      if (!buffer) return;

      // Setup source
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.connect(ctx.destination);
      
      // Calculate start time based on pause state
      const offset = pausedAtRef.current;
      source.start(0, offset);
      startTimeRef.current = ctx.currentTime - offset;
      
      sourceNodeRef.current = source;
      setIsPlaying(true);
      setIsPaused(false);

      // Handle natural playback finish
      source.onended = () => {
        const elapsed = ctx.currentTime - startTimeRef.current;
        // If elapsed time is close to duration (within 0.5s), consider it finished
        // This check avoids resetting state when we manually stop/pause (which also triggers onended)
        if (Math.abs(elapsed - buffer.duration) < 0.5) {
          setIsPlaying(false);
          setIsPaused(false);
          pausedAtRef.current = 0;
        }
      };

    } catch (error) {
      console.error("Failed to play audio:", error);
      alert("Could not generate speech. Please try again.");
      setIsGeneratingAudio(false);
      setIsPlaying(false);
    }
  };

  const handlePause = () => {
    if (sourceNodeRef.current && audioContextRef.current) {
      sourceNodeRef.current.stop();
      sourceNodeRef.current.disconnect();
      // Record where we paused
      pausedAtRef.current = audioContextRef.current.currentTime - startTimeRef.current;
      sourceNodeRef.current = null;
      setIsPlaying(false);
      setIsPaused(true);
    }
  };

  const handleStop = () => {
    stopAudioInternal();
  };

  // Custom Markdown Components
  const markdownComponents = {
    h1: ({node, ...props}: any) => (
      <h1 className="text-2xl font-extrabold text-indigo-950 mt-8 mb-4 border-b border-indigo-100 pb-2" {...props} />
    ),
    h2: ({node, ...props}: any) => (
      <h2 className="text-xl font-bold text-gray-900 mt-6 mb-3" {...props} />
    ),
    h3: ({node, ...props}: any) => (
      <h3 className="text-lg font-semibold text-gray-800 mt-5 mb-2" {...props} />
    ),
    p: ({node, ...props}: any) => (
      <p className="mb-4 leading-relaxed text-gray-700" {...props} />
    ),
    ul: ({node, ...props}: any) => (
      <ul className="list-disc list-outside ml-6 mb-4 space-y-1.5 text-gray-700" {...props} />
    ),
    ol: ({node, ...props}: any) => (
      <ol className="list-decimal list-outside ml-6 mb-4 space-y-1.5 text-gray-700" {...props} />
    ),
    li: ({node, ...props}: any) => (
      <li className="pl-1" {...props} />
    ),
    strong: ({node, ...props}: any) => (
      <strong className="font-bold text-indigo-700" {...props} />
    ),
    blockquote: ({node, ...props}: any) => (
      <blockquote className="border-l-4 border-indigo-300 bg-indigo-50/50 pl-4 py-2 pr-2 my-6 italic text-gray-700 rounded-r-lg" {...props} />
    ),
    code: ({node, inline, className, children, ...props}: any) => {
       return inline ? (
        <code className="bg-gray-100 text-indigo-600 px-1.5 py-0.5 rounded text-sm font-mono" {...props}>
          {children}
        </code>
      ) : (
        <pre className="bg-gray-900 text-gray-100 p-4 rounded-lg overflow-x-auto mb-4 text-sm font-mono">
          <code {...props}>{children}</code>
        </pre>
      );
    }
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

      <div className="bg-white rounded-3xl shadow-xl overflow-hidden border border-gray-100">
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
            
            <div className="flex gap-2">
               {/* Audio Controls */}
               <div className="flex items-center p-1 bg-white border border-gray-200 rounded-xl shadow-sm">
                 {isGeneratingAudio ? (
                   <div className="px-4 py-2 flex items-center gap-2 text-indigo-600">
                     <Loader2 className="w-5 h-5 animate-spin" />
                     <span className="text-sm font-medium">Generating Audio...</span>
                   </div>
                 ) : (
                   <>
                     {!isPlaying && !isPaused ? (
                       <button
                         onClick={handlePlay}
                         className="flex items-center gap-2 px-4 py-2 text-gray-700 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors font-medium text-sm"
                         title="Read Aloud"
                       >
                         <Volume2 className="w-4 h-4" />
                         <span>Read Aloud</span>
                       </button>
                     ) : (
                       <>
                         <button
                           onClick={isPlaying ? handlePause : handlePlay}
                           className="p-2 text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                           title={isPlaying ? "Pause" : "Resume"}
                         >
                           {isPlaying ? <Pause className="w-5 h-5 fill-current" /> : <Play className="w-5 h-5 fill-current" />}
                         </button>
                         <button
                           onClick={handleStop}
                           className="p-2 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                           title="Stop"
                         >
                           <Square className="w-5 h-5 fill-current" />
                         </button>
                       </>
                     )}
                   </>
                 )}
               </div>

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

        {/* Content */}
        <div className="p-8 md:p-12">
          {/* We remove the 'prose' class here to rely on our custom components for better control, 
              or keep 'prose' as a fallback but override everything via components. 
              Let's remove 'prose' to ensure our custom styling takes full precedence. */}
          <div className="text-gray-700">
             <ReactMarkdown components={markdownComponents}>{analysis}</ReactMarkdown>
          </div>
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