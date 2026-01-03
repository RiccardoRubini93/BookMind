import React, { useCallback, useState } from 'react';
import { Upload, FileText, Loader2, AlertCircle } from 'lucide-react';

interface FileUploadProps {
  onFileSelect: (file: File) => void;
  isLoading: boolean;
  error?: string;
}

export const FileUpload: React.FC<FileUploadProps> = ({ onFileSelect, isLoading, error }) => {
  const [dragActive, setDragActive] = useState(false);

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0];
      if (file.type === "application/pdf") {
        onFileSelect(file);
      }
    }
  }, [onFileSelect]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    e.preventDefault();
    if (e.target.files && e.target.files[0]) {
      onFileSelect(e.target.files[0]);
    }
  };

  return (
    <div className="w-full max-w-2xl mx-auto">
      <div 
        className={`relative group bg-white rounded-3xl shadow-xl p-10 transition-all duration-300 ${dragActive ? 'scale-[1.02] ring-4 ring-indigo-100' : 'hover:shadow-2xl'}`}
        onDragEnter={handleDrag}
        onDragLeave={handleDrag}
        onDragOver={handleDrag}
        onDrop={handleDrop}
      >
        <div className={`border-2 border-dashed rounded-2xl p-12 flex flex-col items-center justify-center text-center transition-colors ${dragActive ? 'border-indigo-500 bg-indigo-50' : 'border-gray-200 group-hover:border-indigo-300'}`}>
          
          <div className="w-20 h-20 bg-indigo-50 rounded-2xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform duration-300">
            {isLoading ? (
              <Loader2 className="w-10 h-10 text-indigo-600 animate-spin" />
            ) : (
              <Upload className="w-10 h-10 text-indigo-600" />
            )}
          </div>

          <h3 className="text-2xl font-bold text-gray-900 mb-2">
            {isLoading ? 'Processing Book...' : 'Upload your PDF'}
          </h3>
          
          <p className="text-gray-500 mb-8 max-w-sm mx-auto">
            {isLoading 
              ? 'We are extracting text and identifying chapters. This may take a moment.' 
              : 'Drag and drop your book here, or click to browse files.'}
          </p>

          <input
            type="file"
            id="file-upload"
            className="hidden"
            accept="application/pdf"
            onChange={handleChange}
            disabled={isLoading}
          />
          
          <label 
            htmlFor="file-upload"
            className={`px-8 py-3.5 rounded-xl font-semibold text-white transition-all shadow-lg hover:shadow-indigo-500/30 active:scale-95 cursor-pointer ${isLoading ? 'bg-gray-400 cursor-not-allowed' : 'bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700'}`}
          >
            {isLoading ? 'Analyzing...' : 'Select PDF File'}
          </label>
        </div>
      </div>

      {error && (
        <div className="mt-6 mx-auto max-w-lg bg-red-50 border border-red-100 rounded-xl p-4 flex items-start gap-3 text-red-700 animate-in fade-in slide-in-from-bottom-2">
          <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
          <p className="text-sm font-medium">{error}</p>
        </div>
      )}

      <div className="mt-8 grid grid-cols-3 gap-4 text-center">
        {[
          { icon: FileText, label: "Full Text Extraction" },
          { icon: Loader2, label: "AI Chapter Detection" },
          { icon: Upload, label: "Secure Processing" }
        ].map((item, idx) => (
          <div key={idx} className="flex flex-col items-center gap-2 p-4 rounded-xl bg-white/50 backdrop-blur-sm">
            <item.icon className="w-5 h-5 text-gray-400" />
            <span className="text-xs font-medium text-gray-600 uppercase tracking-wide">{item.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
};