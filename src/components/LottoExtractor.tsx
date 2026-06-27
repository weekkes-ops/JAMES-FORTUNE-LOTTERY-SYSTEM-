import React, { useState, useRef } from "react";
import { LottoResult } from "../types";
import { Upload, FileImage, ShieldCheck, Sparkles, Loader2, ArrowRight, CheckCircle2, AlertTriangle, Image as ImageIcon } from "lucide-react";
import { GAME_COLORS } from "../data";
import { normalizeDateToYMD } from "../utils/dateUtils";

interface LottoExtractorProps {
  onExtractionComplete: (extracted: LottoResult) => boolean | void;
}

export default function LottoExtractor({ onExtractionComplete }: LottoExtractorProps) {
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [loadingStep, setLoadingStep] = useState(0);
  const [error, setError] = useState<string | null>(null);

  // Parsing result preview / verification state
  const [parsedData, setParsedData] = useState<LottoResult | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Rotating loading messages
  const loadingSteps = [
    "Analyzing image bounds & alignment...",
    "Scanning headers for Game Name...",
    "Locating Winning number series (brown/yellow/blue balls)...",
    "Isolating Extra number series...",
    "Decoding Machine number series...",
    "Validating integers & structures with Gemini AI..."
  ];

  const triggerLoaderNotes = () => {
    setLoadingStep(0);
    const interval = setInterval(() => {
      setLoadingStep((prev) => {
        if (prev < loadingSteps.length - 1) return prev + 1;
        return prev;
      });
    }, 1500);
    return interval;
  };

  const handleFile = (file: File) => {
    if (!file.type.startsWith("image/")) {
      setError("Please upload an image file (PNG, JPG, JPEG, WEBP).");
      return;
    }
    setError(null);
    setImageFile(file);
    setParsedData(null);

    const reader = new FileReader();
    reader.onloadend = () => {
      setImagePreview(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFile(e.dataTransfer.files[0]);
    }
  };

  const selectFileManually = () => {
    fileInputRef.current?.click();
  };

  const processImageExtraction = async () => {
    if (!imagePreview) return;
    setIsLoading(true);
    setError(null);
    const intervalId = triggerLoaderNotes();

    try {
      const response = await fetch("/api/extract", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ image: imagePreview }),
      });

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || "Failed to parse the lottery image. Please ensure your API key is configured.");
      }

      const res = await response.json();
      if (res.success && res.data) {
        // Construct complete LottoResult structure
        const result: LottoResult = {
          id: "lotto-extracted-" + Date.now(),
          gameName: res.data.gameName || "MAD MAX",
          date: res.data.date ? normalizeDateToYMD(res.data.date) : new Date().toISOString().split("T")[0],
          time: res.data.time || "2PM",
          edition: res.data.edition || "0",
          winningNumbers: Array.isArray(res.data.winningNumbers) ? res.data.winningNumbers.slice(0, 5) : [0, 0, 0, 0, 0],
          extraNumbers: Array.isArray(res.data.extraNumbers) ? res.data.extraNumbers.slice(0, 2) : [0, 0],
          machineNumbers: Array.isArray(res.data.machineNumbers) ? res.data.machineNumbers.slice(0, 5) : [0, 0, 0, 0, 0]
        };

        // Fill trailing placeholders with zeros if short
        while (result.winningNumbers.length < 5) result.winningNumbers.push(0);
        while (result.extraNumbers.length < 2) result.extraNumbers.push(0);
        while (result.machineNumbers.length < 5) result.machineNumbers.push(0);

        setParsedData(result);
      } else {
        throw new Error("No structured data returned from the server.");
      }
    } catch (err: any) {
      console.error(err);
      setError(err.message || "An unexpected error occurred during extraction.");
    } finally {
      clearInterval(intervalId);
      setIsLoading(false);
    }
  };

  const saveExtractedToLedger = () => {
    if (parsedData) {
      const success = onExtractionComplete(parsedData);
      if (success !== false) {
        setParsedData(null);
        setImageFile(null);
        setImagePreview(null);
      }
    }
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-5 space-y-6" id="lotto-extractor-container">
      <div>
        <h2 className="text-lg font-semibold text-slate-800 flex items-center gap-1.5">
          <Sparkles size={18} className="text-indigo-600" /> Live Lotto slip Extractor (Gemini-OCR)
        </h2>
        <p className="text-xs text-slate-500 mt-0.5">
          Upload a screenshot or photo of an additional lottery results bulletin. Gemini will run structured OCR.
        </p>
      </div>

      {error && (
        <div className="p-3 bg-rose-50 border border-rose-100 rounded-lg flex items-start gap-2.5 text-xs text-rose-700 font-medium" id="extractor-error">
          <AlertTriangle size={16} className="shrink-0 text-rose-500 mt-0.5" />
          <div>
            <span className="font-bold">Extraction Failed:</span> {error}
            <div className="mt-1 font-normal opacity-90">
              Note: Make sure your <strong className="font-bold">GEMINI_API_KEY</strong> is set in the AI Studio Secrets panel.
            </div>
          </div>
        </div>
      )}

      {/* Main Extractor Layout */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        
        {/* Dropzone Container */}
        <div className="space-y-4">
          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={selectFileManually}
            className={`h-56 border-2 border-dashed rounded-xl flex flex-col items-center justify-center p-4 text-center cursor-pointer transition relative group overflow-hidden ${
              isDragging 
                ? "border-indigo-500 bg-indigo-50/50" 
                : imagePreview 
                  ? "border-slate-200 bg-slate-50/50" 
                  : "border-slate-300 hover:border-indigo-400 hover:bg-slate-50/30"
            }`}
            id="drag-drop-area"
          >
            <input
              type="file"
              ref={fileInputRef}
              onChange={(e) => e.target.files && handleFile(e.target.files[0])}
              className="hidden"
              accept="image/*"
            />

            {imagePreview ? (
              <div className="absolute inset-0 flex items-center justify-center bg-slate-900/40 opacity-0 group-hover:opacity-100 transition duration-250">
                <p className="text-white text-xs font-semibold flex items-center gap-1">
                  <Upload size={14} /> Replace Image File
                </p>
              </div>
            ) : null}

            {imagePreview ? (
              <img 
                src={imagePreview} 
                alt="Upload Preview" 
                className="max-h-full max-w-full object-contain rounded" 
                referrerPolicy="no-referrer"
              />
            ) : (
              <div className="space-y-2 flex flex-col items-center">
                <div className="w-11 h-11 bg-indigo-50 text-indigo-600 rounded-full flex items-center justify-center shadow-xs group-hover:scale-105 transition duration-200">
                  <Upload size={20} />
                </div>
                <div>
                  <p className="text-xs font-semibold text-slate-700">Drag & Drop Lotto Image here</p>
                  <p className="text-[10px] text-slate-400 mt-1">Supports JPEG, PNG, WEBP. Minimum 44px touch-target.</p>
                </div>
                <button
                  type="button"
                  className="px-3 py-1 bg-white border border-slate-200 hover:border-slate-300 hover:bg-slate-50 text-slate-700 text-xs font-semibold rounded-lg transition shadow-xs cursor-pointer"
                >
                  Select File
                </button>
              </div>
            )}
          </div>

          {/* Action buttons */}
          {imagePreview && !isLoading && !parsedData && (
            <button
              onClick={processImageExtraction}
              className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-lg flex items-center justify-center gap-1.5 shadow-xs transition cursor-pointer"
              id="start-ocr-btn"
            >
              <Sparkles size={14} /> Extract Drawing Details
            </button>
          )}

          {/* Loader Overlay inside parent or text */}
          {isLoading && (
            <div className="p-4 bg-indigo-50/50 rounded-xl border border-indigo-100 flex flex-col items-center text-center space-y-3 animate-pulse">
              <Loader2 className="animate-spin text-indigo-600" size={24} />
              <div className="space-y-1">
                <p className="text-xs font-bold text-indigo-900">Structured AI OCR Active</p>
                <p className="text-[10px] text-indigo-600 font-medium transition-all duration-300">{loadingSteps[loadingStep]}</p>
              </div>
            </div>
          )}
        </div>

        {/* Verification & Results Column */}
        <div className="bg-slate-50 rounded-xl p-4 border border-slate-100 flex flex-col justify-between min-h-[14rem]">
          {parsedData ? (
            <div className="space-y-4 animate-fadeIn">
              <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                <span className="text-xs font-bold text-slate-700 flex items-center gap-1">
                  <ShieldCheck className="text-emerald-500" size={15} /> OCR Output Verification
                </span>
                <span className="text-[10px] bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded font-bold uppercase">Success</span>
              </div>

              {/* Parsed Result Fields (Editable before adding) */}
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div>
                  <label className="block text-[10px] text-slate-400 font-bold uppercase">Game Name</label>
                  <input
                    type="text"
                    value={parsedData.gameName}
                    onChange={(e) => setParsedData({ ...parsedData, gameName: e.target.value })}
                    className="w-full mt-1 px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-slate-800 font-semibold"
                  />
                </div>
                <div>
                  <label className="block text-[10px] text-slate-400 font-bold uppercase">Edition</label>
                  <input
                    type="text"
                    value={parsedData.edition}
                    onChange={(e) => setParsedData({ ...parsedData, edition: e.target.value })}
                    className="w-full mt-1 px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-slate-800 font-semibold"
                  />
                </div>
                <div>
                  <label className="block text-[10px] text-slate-400 font-bold uppercase">Date</label>
                  <input
                    type="date"
                    value={parsedData.date}
                    onChange={(e) => setParsedData({ ...parsedData, date: e.target.value })}
                    className="w-full mt-1 px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-slate-800 font-semibold"
                  />
                </div>
                <div>
                  <label className="block text-[10px] text-slate-400 font-bold uppercase">Draw Time</label>
                  <input
                    type="text"
                    value={parsedData.time}
                    onChange={(e) => setParsedData({ ...parsedData, time: e.target.value })}
                    className="w-full mt-1 px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-slate-800 font-semibold"
                  />
                </div>
              </div>

              {/* Number sequences */}
              <div className="space-y-2 pt-2 border-t border-slate-200/60">
                <div className="flex items-center gap-2">
                  <span className="w-14 text-[10px] text-slate-400 font-bold uppercase">Winning:</span>
                  <div className="flex gap-1">
                    {parsedData.winningNumbers.map((n, i) => (
                      <input
                        key={i}
                        type="number"
                        value={n || ""}
                        onChange={(e) => {
                          const copy = [...parsedData.winningNumbers];
                          copy[i] = parseInt(e.target.value, 10) || 0;
                          setParsedData({ ...parsedData, winningNumbers: copy });
                        }}
                        className="w-8 h-8 rounded-full bg-slate-950 border border-slate-850 text-white font-mono text-xs font-bold text-center flex items-center justify-center"
                      />
                    ))}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <span className="w-14 text-[10px] text-slate-400 font-bold uppercase">Extra:</span>
                  <div className="flex gap-1">
                    {parsedData.extraNumbers.map((n, i) => (
                      <input
                        key={i}
                        type="number"
                        value={n || ""}
                        onChange={(e) => {
                          const copy = [...parsedData.extraNumbers];
                          copy[i] = parseInt(e.target.value, 10) || 0;
                          setParsedData({ ...parsedData, extraNumbers: copy });
                        }}
                        className="w-8 h-8 rounded-full bg-emerald-500 border border-emerald-600 text-white font-mono text-xs font-bold text-center flex items-center justify-center"
                      />
                    ))}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <span className="w-14 text-[10px] text-slate-400 font-bold uppercase">Machine:</span>
                  <div className="flex gap-1">
                    {parsedData.machineNumbers.map((n, i) => (
                      <input
                        key={i}
                        type="number"
                        value={n || ""}
                        onChange={(e) => {
                          const copy = [...parsedData.machineNumbers];
                          copy[i] = parseInt(e.target.value, 10) || 0;
                          setParsedData({ ...parsedData, machineNumbers: copy });
                        }}
                        className="w-8 h-8 rounded-full bg-slate-200 border border-slate-300 text-slate-700 font-mono text-xs font-bold text-center flex items-center justify-center"
                      />
                    ))}
                  </div>
                </div>
              </div>

              <button
                onClick={saveExtractedToLedger}
                className="w-full py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-lg flex items-center justify-center gap-1.5 transition shadow-sm mt-3 cursor-pointer"
                id="save-ocr-btn"
              >
                <CheckCircle2 size={14} /> Commit to Spreadsheet Ledger
              </button>
            </div>
          ) : (
            <div className="h-full flex flex-col items-center justify-center text-center p-4">
              <ImageIcon size={32} className="text-slate-300 mb-2" />
              <p className="text-xs font-semibold text-slate-600">Pending Extraction Output</p>
              <p className="text-[10px] text-slate-400 mt-1 max-w-[200px] mx-auto">
                Once you select an image and trigger "Extract", parsed fields will load here for double-checking.
              </p>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
