import React, { useState } from 'react';
import { Chapter, AnalysisType } from '../types';
import { BookOpen, ChevronDown, Sparkles, FileText, Scale, History } from 'lucide-react';

interface ChapterListProps {
  chapters: Chapter[];
  onChapterSelect: (chapter: Chapter, type: AnalysisType) => void;
  onReset: () => void;
  activeChapter?: Chapter | null;
}

const ANALYSIS_OPTIONS = [
  {
    type: AnalysisType.STANDARD,
    label: "Standard",
    icon: FileText,
    desc: "Complete & concise summary",
    color: "bg-blue-100 text-blue-700"
  },
  {
    type: AnalysisType.DETAILED,
    label: "Detailed",
    icon: BookOpen,
    desc: "Concepts, examples & conclusions",
    color: "bg-emerald-100 text-emerald-700"
  },
  {
    type: AnalysisType.INSIGHTS,
    label: "Insights",
    icon: Sparkles,
    desc: "Reflections & practical applications",
    color: "bg-amber-100 text-amber-700"
  },
  {
    type: AnalysisType.CRITICAL,
    label: "Critical",
    icon: Scale, 
    desc: "Strengths, weaknesses & critique",
    color: "bg-rose-100 text-rose-700"
  }
];

export const ChapterList: React.FC<ChapterListProps> = ({ chapters, onChapterSelect, onReset, activeChapter }) => {
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);

  const toggleChapter = (index: number) => {
    setExpandedIndex(prev => prev === index ? null : index);
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-2">
        <div>
          <h2 className="text-3xl font-bold text-gray-900">Table of Contents</h2>
          <p className="text-gray-500 mt-1">Select a chapter to choose your analysis type.</p>
        </div>
        <button 
          onClick={onReset}
          className="px-4 py-2 text-sm font-medium text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 hover:text-gray-900 transition-colors"
        >
          Upload New Book
        </button>
      </div>

      {/* List */}
      <div className="space-y-4">
        {chapters.map((chapter, idx) => {
          const isActive = activeChapter?.title === chapter.title && activeChapter?.number === chapter.number;
          const isExpanded = expandedIndex === idx;
          
          return (
            <div 
              key={idx}
              className={`rounded-2xl border transition-all duration-300 overflow-hidden ${
                isActive || isExpanded
                  ? 'bg-white border-indigo-200 shadow-lg ring-1 ring-indigo-50'
                  : 'bg-white border-gray-200 hover:border-indigo-200 hover:shadow-md'
              }`}
            >
              {/* Chapter Header (Clickable) */}
              <button
                onClick={() => toggleChapter(idx)}
                className="w-full flex items-center gap-4 p-5 text-left transition-colors focus:outline-none"
              >
                <div className={`flex-shrink-0 w-12 h-12 rounded-xl flex items-center justify-center font-bold text-sm border transition-colors
                    ${isActive 
                        ? 'bg-indigo-600 text-white border-indigo-600' 
                        : isExpanded
                          ? 'bg-indigo-100 text-indigo-700 border-indigo-200'
                          : 'bg-gray-100 text-gray-500 border-gray-200 group-hover:border-indigo-200'
                    }
                `}>
                  {chapter.number.replace(/[^0-9IVX]/g, '') || (idx + 1)}
                </div>
                
                <div className="flex-grow">
                  <div className="flex items-center gap-2 mb-0.5">
                    <h4 className={`text-lg font-semibold ${isActive || isExpanded ? 'text-indigo-900' : 'text-gray-900'}`}>
                      {chapter.title}
                    </h4>
                    {isActive && (
                      <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 text-xs font-medium border border-indigo-100">
                        <History className="w-3 h-3" />
                        <span>Last Viewed</span>
                      </div>
                    )}
                  </div>
                  <p className="text-sm text-gray-500 line-clamp-1">
                    {chapter.description}
                  </p>
                </div>

                <div className={`flex-shrink-0 transition-transform duration-300 ${isExpanded ? 'rotate-180' : ''}`}>
                  <ChevronDown className={`w-5 h-5 ${isExpanded || isActive ? 'text-indigo-500' : 'text-gray-400'}`} />
                </div>
              </button>

              {/* Expansion Panel (Analysis Options) */}
              <div 
                className={`grid transition-all duration-300 ease-in-out ${
                  isExpanded ? 'grid-rows-[1fr] opacity-100 border-t border-indigo-50' : 'grid-rows-[0fr] opacity-0'
                }`}
              >
                <div className="overflow-hidden">
                  <div className="p-5 bg-gray-50/50">
                    <h5 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-4 ml-1">
                      Choose Analysis Type
                    </h5>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                      {ANALYSIS_OPTIONS.map((option) => (
                        <button
                          key={option.type}
                          onClick={(e) => {
                            e.stopPropagation();
                            onChapterSelect(chapter, option.type);
                          }}
                          className="flex flex-col items-start p-4 rounded-xl border border-gray-200 bg-white hover:border-indigo-400 hover:ring-2 hover:ring-indigo-100 hover:shadow-lg hover:-translate-y-1 transition-all duration-200 text-left group h-full"
                        >
                          <div className={`p-2 rounded-lg mb-3 ${option.color} group-hover:scale-110 transition-transform`}>
                            <option.icon className="w-4 h-4" />
                          </div>
                          <span className="font-semibold text-gray-900 mb-1">
                            {option.label}
                          </span>
                          <span className="text-xs text-gray-500 leading-snug">
                            {option.desc}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};