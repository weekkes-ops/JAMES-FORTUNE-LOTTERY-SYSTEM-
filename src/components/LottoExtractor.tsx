import React, { useState, useRef, useMemo } from "react";
import { LottoResult } from "../types";
import { 
  Upload, 
  FileImage, 
  ShieldCheck, 
  Sparkles, 
  Loader2, 
  CheckCircle2, 
  AlertTriangle, 
  Image as ImageIcon, 
  Trash2, 
  Play, 
  Layers,
  RotateCcw,
  TrendingUp,
  Brain,
  ArrowRight,
  Zap,
  Info
} from "lucide-react";
import { normalizeDateToYMD } from "../utils/dateUtils";
import { calculateLocalStatisticalPrediction, PredictionData } from "../utils/predictionEngine";
import { optimizeImageForOcr } from "../utils/imageOptimizer";
import { directClientExtract } from "../services/geminiClientService";

interface LottoExtractorProps {
  results: LottoResult[];
  onExtractionComplete: (extracted: LottoResult) => boolean | void;
}

interface ImageQueueItem {
  id: string;
  file: File;
  preview: string;
  status: "pending" | "extracting" | "success" | "failed" | "committed";
  error?: string;
  extractedData?: LottoResult;
}

export default function LottoExtractor({ results, onExtractionComplete }: LottoExtractorProps) {
  const [queue, setQueue] = useState<ImageQueueItem[]>([]);
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isBatchExtracting, setIsBatchExtracting] = useState(false);
  const [globalError, setGlobalError] = useState<string | null>(null);
  const [loadingStep, setLoadingStep] = useState(0);
  const [autoExtractOnUpload, setAutoExtractOnUpload] = useState<boolean>(true);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Rotating loading messages for extraction progress
  const loadingSteps = [
    "Analyzing image bounds & alignment...",
    "Scanning headers for Game Name...",
    "Locating Winning number series (yellow/blue balls)...",
    "Isolating Extra number series...",
    "Decoding Machine number series...",
    "Predicting next winning numbers with AI..."
  ];

  // Selected queue item
  const selectedItem = useMemo(() => {
    return queue.find((item) => item.id === selectedItemId) || null;
  }, [queue, selectedItemId]);

  // Instant next game winning numbers prediction computed dynamically for the selected extracted result
  const instantPrediction = useMemo<PredictionData | null>(() => {
    if (!selectedItem || !selectedItem.extractedData) return null;
    const itemData = selectedItem.extractedData;
    // Blend current database history with the newly extracted draw
    const combinedHistory = [
      itemData,
      ...results.filter(
        (r) =>
          !(
            r.gameName.trim().toLowerCase() === itemData.gameName.trim().toLowerCase() &&
            r.edition.trim().toLowerCase() === itemData.edition.trim().toLowerCase()
          )
      )
    ];

    try {
      return calculateLocalStatisticalPrediction(itemData.gameName, combinedHistory, "balanced");
    } catch {
      return null;
    }
  }, [selectedItem, results]);

  // Check if selected item's extracted data is a duplicate of a draw in the database
  const isDuplicateOfExisting = useMemo(() => {
    if (!selectedItem || !selectedItem.extractedData) return false;
    const cur = selectedItem.extractedData;
    return results.some(
      (r) =>
        r.gameName.trim().toLowerCase() === cur.gameName.trim().toLowerCase() &&
        normalizeDateToYMD(r.date) === normalizeDateToYMD(cur.date) &&
        r.time.trim().toLowerCase() === cur.time.trim().toLowerCase()
    );
  }, [selectedItem, results]);

  // Handle file uploads (both drag-and-drop and manual select)
  const handleFiles = async (files: FileList) => {
    const fileArray = Array.from(files);
    const validFiles = fileArray.filter((file) => file.type.startsWith("image/"));

    if (validFiles.length === 0) {
      setGlobalError("Please upload valid lottery bulletin image files (PNG, JPG, JPEG, WEBP).");
      return;
    }

    // Enforce a maximum batch size limit of 15 files
    if (validFiles.length > 15) {
      setGlobalError(`Batch size limit exceeded. You attempted to upload ${validFiles.length} images. Please upload a maximum of 15 images per batch to ensure reliable parsing and optimal browser performance.`);
      return;
    }

    // Enforce a maximum overall queue limit of 30 files
    if (queue.length + validFiles.length > 30) {
      setGlobalError(`Queue capacity limit reached. Adding these files would exceed the maximum queue size of 30 drawings. Please process, save, or clear items currently in your queue first.`);
      return;
    }

    setGlobalError(null);

    const loadPromises = validFiles.map(async (file) => {
      try {
        // Optimize and downscale large mobile camera images to prevent 413/404/payload limits
        const { optimizedBase64 } = await optimizeImageForOcr(file, 1600, 0.86);
        return {
          id: "img-" + Date.now() + "-" + Math.random().toString(36).substr(2, 5),
          file,
          preview: optimizedBase64,
          status: "pending" as const,
        };
      } catch (optErr) {
        // Fallback to standard FileReader if canvas downscaling fails
        return new Promise<ImageQueueItem>((resolve) => {
          const reader = new FileReader();
          reader.onloadend = () => {
            resolve({
              id: "img-" + Date.now() + "-" + Math.random().toString(36).substr(2, 5),
              file,
              preview: reader.result as string,
              status: "pending",
            });
          };
          reader.readAsDataURL(file);
        });
      }
    });

    const loadedItems = await Promise.all(loadPromises);

    let newlyAddedIds: string[] = [];

    setQueue((prev) => {
      // Filter out files already added in this session by name + size
      const filteredLoaded = loadedItems.filter(
        (loaded) => !prev.some((item) => item.file.name === loaded.file.name && item.file.size === loaded.file.size)
      );
      newlyAddedIds = filteredLoaded.map((i) => i.id);
      const nextQueue = [...prev, ...filteredLoaded];

      if (filteredLoaded.length > 0) {
        setSelectedItemId((current) => current || filteredLoaded[0].id);
      }
      return nextQueue;
    });

    // Auto-extract immediately if enabled
    if (autoExtractOnUpload && newlyAddedIds.length > 0) {
      setTimeout(() => {
        triggerAutoExtraction(newlyAddedIds);
      }, 100);
    }
  };

  // Helper to run auto-extraction sequentially on a set of item IDs
  const triggerAutoExtraction = async (itemIds: string[]) => {
    if (itemIds.length === 0 || isBatchExtracting) return;
    setIsBatchExtracting(true);
    setGlobalError(null);

    for (let i = 0; i < itemIds.length; i++) {
      const id = itemIds[i];
      setSelectedItemId(id);
      await extractItem(id, (step) => setLoadingStep(step));
      if (i < itemIds.length - 1) {
        await new Promise((resolve) => setTimeout(resolve, 400));
      }
    }

    setIsBatchExtracting(false);
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
      handleFiles(e.dataTransfer.files);
    }
  };

  const selectFilesManually = () => {
    fileInputRef.current?.click();
  };

  // Perform Gemini API OCR extraction on a single queue item
  const extractItem = async (itemId: string, stepCallback?: (step: number) => void): Promise<boolean> => {
    const item = queue.find((q) => q.id === itemId);
    if (!item) return false;

    setQueue((prev) =>
      prev.map((q) => (q.id === itemId ? { ...q, status: "extracting", error: undefined } : q))
    );

    let stepInterval: NodeJS.Timeout | null = null;
    if (stepCallback) {
      let currentStep = 0;
      stepCallback(0);
      stepInterval = setInterval(() => {
        currentStep = Math.min(currentStep + 1, loadingSteps.length - 1);
        stepCallback(currentStep);
      }, 750);
    }

    try {
      let extractedResult: LottoResult | null = null;

      // 1. First attempt: standard server/serverless /api/extract endpoint
      let response: Response | null = null;
      try {
        response = await fetch("/api/extract", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            image: item.preview,
            mimeType: item.file.type || "image/jpeg",
          }),
        });
      } catch (fetchErr: any) {
        console.warn("API fetch error, checking fallback:", fetchErr);
      }

      if (response && response.ok) {
        const responseText = await response.text();
        let res: any;
        try {
          res = JSON.parse(responseText);
        } catch {
          throw new Error("Invalid response format from server.");
        }

        if (!res.success) {
          throw new Error(res.error || "No structured data was returned. Please ensure the image is clear.");
        }

        if (res.data) {
          extractedResult = {
            id: "lotto-extracted-" + Date.now() + "-" + Math.random().toString(36).substr(2, 4),
            gameName: (res.data.gameName || "MAD MAX").trim().toUpperCase(),
            edition: (res.data.edition || "").trim(),
            date: normalizeDateToYMD(res.data.date),
            time: (res.data.time || "18:30").trim(),
            winningNumbers: Array.isArray(res.data.winningNumbers)
              ? res.data.winningNumbers.map(Number)
              : [],
            extraNumbers: Array.isArray(res.data.extraNumbers)
              ? res.data.extraNumbers.map(Number)
              : [],
            machineNumbers: Array.isArray(res.data.machineNumbers)
              ? res.data.machineNumbers.map(Number)
              : [],
          };
        }
      } else if (response && response.status === 404) {
        // If 404 on Vercel/custom hosting, attempt client fallback if available
        try {
          const clientFallback = await directClientExtract(item.preview, item.file.type);
          if (clientFallback) {
            extractedResult = clientFallback;
          } else {
            throw new Error(
              "API Route Missing (Status 404): The serverless endpoint (/api/extract) was not reached. Please ensure your Vercel deployment has GEMINI_API_KEY set in Project Settings > Environment Variables, and that the latest serverless API files are deployed."
            );
          }
        } catch (fbErr: any) {
          throw new Error(
            fbErr.message ||
              "API Route Missing (Status 404): The serverless endpoint (/api/extract) was not reached. Please ensure your Vercel deployment has GEMINI_API_KEY set in Project Settings > Environment Variables."
          );
        }
      } else if (response) {
        const responseText = await response.text();
        let res: any;
        try {
          res = JSON.parse(responseText);
        } catch {
          throw new Error(`Server Error (Status ${response.status}): The request could not be processed. Please try again shortly.`);
        }
        throw new Error(res.error || `Server Error (Status ${response.status})`);
      } else {
        // Response was null (fetch failed / network disconnected)
        const clientFallback = await directClientExtract(item.preview, item.file.type);
        if (clientFallback) {
          extractedResult = clientFallback;
        } else {
          throw new Error("Network error: Unable to connect to extraction endpoint. Please check your internet connection.");
        }
      }

      if (stepInterval) clearInterval(stepInterval);

      if (extractedResult) {
        setQueue((prev) =>
          prev.map((q) =>
            q.id === itemId
              ? {
                  ...q,
                  status: "success",
                  extractedData: extractedResult!,
                }
              : q
          )
        );
        return true;
      } else {
        throw new Error("No structured lotto data was returned.");
      }
    } catch (err: any) {
      if (stepInterval) clearInterval(stepInterval);
      const errMsg = err.message || "Failed to extract text from lotto slip.";
      setQueue((prev) =>
        prev.map((q) =>
          q.id === itemId
            ? {
                ...q,
                status: "failed",
                error: errMsg,
              }
            : q
        )
      );
      return false;
    }
  };

  // Run extraction sequentially on all pending items in the queue
  const handleExtractAllPending = async () => {
    const pendingItems = queue.filter((q) => q.status === "pending" || q.status === "failed");
    if (pendingItems.length === 0 || isBatchExtracting) return;

    setIsBatchExtracting(true);
    setGlobalError(null);

    for (let i = 0; i < pendingItems.length; i++) {
      const item = pendingItems[i];
      setSelectedItemId(item.id);
      await extractItem(item.id, (step) => setLoadingStep(step));
      // Small pause between items to prevent hitting burst rate limits when processing multiple images (e.g., 15 files)
      if (i < pendingItems.length - 1) {
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
    }

    setIsBatchExtracting(false);
  };

  // Commit a single selected, verified result to the ledger
  const saveExtractedToLedger = () => {
    if (selectedItem && selectedItem.extractedData && selectedItem.status === "success") {
      const success = onExtractionComplete(selectedItem.extractedData);
      if (success !== false) {
        setQueue((prev) =>
          prev.map((q) => (q.id === selectedItem.id ? { ...q, status: "committed" } : q))
        );
      }
    }
  };

  // Commit and immediately scroll to the Prediction Hub
  const saveAndOpenPredictionHub = () => {
    saveExtractedToLedger();
    setTimeout(() => {
      const element = document.getElementById("prediction-analytics-hub");
      if (element) {
        element.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    }, 200);
  };

  // Commit all success items in the queue at once
  const handleCommitAllVerified = () => {
    const verifiedItems = queue.filter((q) => q.status === "success" && q.extractedData);
    if (verifiedItems.length === 0) return;

    let successCount = 0;
    setQueue((prev) => {
      const nextQueue = [...prev];
      verifiedItems.forEach((item) => {
        const data = item.extractedData;
        if (!data) return;

        // Check for duplicate in live results
        const isDuplicate = results.some(
          (r) =>
            r.gameName.trim().toLowerCase() === data.gameName.trim().toLowerCase() &&
            normalizeDateToYMD(r.date) === normalizeDateToYMD(data.date) &&
            r.time.trim().toLowerCase() === data.time.trim().toLowerCase()
        );

        if (!isDuplicate) {
          const success = onExtractionComplete(data);
          if (success !== false) {
            successCount++;
            const idx = nextQueue.findIndex((q) => q.id === item.id);
            if (idx !== -1) {
              nextQueue[idx] = { ...nextQueue[idx], status: "committed" };
            }
          }
        } else {
          // Flag individual item with error
          const idx = nextQueue.findIndex((q) => q.id === item.id);
          if (idx !== -1) {
            nextQueue[idx] = { ...nextQueue[idx], error: "Duplicate draw entry is blocked." };
          }
        }
      });
      return nextQueue;
    });
  };

  // Remove individual item from the queue
  const handleRemoveItem = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setQueue((prev) => {
      const filtered = prev.filter((item) => item.id !== id);
      if (selectedItemId === id) {
        setSelectedItemId(filtered.length > 0 ? filtered[0].id : null);
      }
      return filtered;
    });
  };

  const handleClearQueue = () => {
    setQueue([]);
    setSelectedItemId(null);
    setGlobalError(null);
  };

  // Update fields of currently selected item
  const handleFieldChange = (fields: Partial<LottoResult>) => {
    if (!selectedItem || !selectedItem.extractedData) return;
    setQueue((prev) =>
      prev.map((q) => {
        if (q.id === selectedItem.id && q.extractedData) {
          return {
            ...q,
            extractedData: {
              ...q.extractedData,
              ...fields,
            } as LottoResult,
          };
        }
        return q;
      })
    );
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-5 space-y-5 w-full flex flex-col" id="lotto-extractor-container">
      
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
        <div>
          <h2 className="text-md font-bold text-slate-800 flex items-center gap-1.5">
            <Sparkles size={18} className="text-indigo-600 shrink-0" /> Batch Image Bulletin Extractor & Predictor
          </h2>
          <p className="text-[11px] text-slate-500 mt-0.5">
            Upload new lottery screenshots to automatically parse results and forecast the next winning numbers.
          </p>
        </div>
        
        <div className="flex items-center gap-3 self-start sm:self-auto flex-wrap">
          {/* Auto-Extract Toggle */}
          <label className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-600 cursor-pointer select-none bg-slate-50 border border-slate-200 px-2.5 py-1 rounded-lg">
            <input
              type="checkbox"
              checked={autoExtractOnUpload}
              onChange={(e) => setAutoExtractOnUpload(e.target.checked)}
              className="accent-indigo-600 rounded"
            />
            <span className="flex items-center gap-1">
              <Zap size={12} className={autoExtractOnUpload ? "text-amber-500 fill-amber-500" : "text-slate-400"} />
              Auto-Predict on Upload
            </span>
          </label>

          {queue.length > 0 && (
            <button
              onClick={handleClearQueue}
              disabled={isBatchExtracting}
              className="text-slate-400 hover:text-rose-600 disabled:opacity-40 text-xs font-semibold flex items-center gap-1 transition cursor-pointer"
            >
              <RotateCcw size={13} /> Clear All
            </button>
          )}
        </div>
      </div>

      {globalError && (
        <div className="p-3 bg-rose-50 border border-rose-100 rounded-lg flex items-start gap-2.5 text-xs text-rose-700 font-medium" id="extractor-error">
          <AlertTriangle size={16} className="shrink-0 text-rose-500 mt-0.5" />
          <div>{globalError}</div>
        </div>
      )}

      {/* Main Extractor Layout */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-5">
        
        {/* Left / Top panel: Dropzone and Queue List */}
        <div className="xl:col-span-5 space-y-4 flex flex-col">
          
          {/* File Dropzone */}
          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={selectFilesManually}
            className={`h-36 border-2 border-dashed rounded-xl flex flex-col items-center justify-center p-4 text-center cursor-pointer transition relative group overflow-hidden ${
              isDragging 
                ? "border-indigo-500 bg-indigo-50/50" 
                : "border-slate-300 hover:border-indigo-400 hover:bg-slate-50/30"
            }`}
            id="drag-drop-area"
          >
            <input
              type="file"
              ref={fileInputRef}
              onChange={(e) => e.target.files && handleFiles(e.target.files)}
              className="hidden"
              accept="image/*"
              multiple
            />

            <div className="space-y-1.5 flex flex-col items-center">
              <div className="w-9 h-9 bg-indigo-50 text-indigo-600 rounded-full flex items-center justify-center shadow-xs group-hover:scale-105 transition duration-200">
                <Upload size={16} />
              </div>
              <div>
                <p className="text-xs font-semibold text-slate-700">Drag & Drop Lotto Image(s) here</p>
                <p className="text-[10px] text-slate-400 mt-0.5">Supports PNG, JPG, WEBP. Instant next-game prediction.</p>
              </div>
              <span className="px-2.5 py-0.5 bg-white border border-slate-250 hover:bg-slate-50 text-slate-700 text-[10px] font-bold rounded-md transition shadow-xs">
                Select Files
              </span>
            </div>
          </div>

          {/* Queue List */}
          {queue.length > 0 ? (
            <div className="space-y-3 flex-1 flex flex-col min-h-[220px]">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1">
                  <Layers size={12} className="text-slate-400" /> Queue ({queue.length} files)
                </span>
                <span className="text-[10px] text-slate-400 font-medium">Click item to verify details</span>
              </div>

              <div className="max-h-60 overflow-y-auto border border-slate-100 rounded-xl divide-y divide-slate-100 pr-1 scrollbar-thin">
                {queue.map((item) => {
                  const isActive = item.id === selectedItemId;
                  return (
                    <div
                      key={item.id}
                      onClick={() => setSelectedItemId(item.id)}
                      className={`p-2.5 flex items-center justify-between gap-3 cursor-pointer transition ${
                        isActive 
                          ? "bg-indigo-50/70 border-l-4 border-indigo-600" 
                          : "hover:bg-slate-50/60 border-l-4 border-transparent"
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <img
                          src={item.preview}
                          alt="Thumbnail"
                          className="w-10 h-10 object-cover rounded border border-slate-200 shrink-0"
                          referrerPolicy="no-referrer"
                        />
                        <div className="min-w-0">
                          <p className="text-[11px] font-bold text-slate-700 truncate max-w-[130px]">
                            {item.file.name}
                          </p>
                          <p className="text-[10px] text-slate-400">
                            {(item.file.size / 1024).toFixed(1)} KB
                          </p>
                        </div>
                      </div>

                      {/* Status / Actions */}
                      <div className="flex items-center gap-2">
                        {item.status === "pending" && (
                          <span className="text-[9px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded-full font-bold uppercase shrink-0">
                            Ready
                          </span>
                        )}
                        {item.status === "extracting" && (
                          <span className="text-[9px] bg-indigo-50 text-indigo-700 px-1.5 py-0.5 rounded-full font-bold uppercase flex items-center gap-1 shrink-0 animate-pulse">
                            <Loader2 size={10} className="animate-spin" /> Scan
                          </span>
                        )}
                        {item.status === "success" && (
                          <span className="text-[9px] bg-amber-50 text-amber-700 px-1.5 py-0.5 rounded-full font-bold uppercase shrink-0 flex items-center gap-0.5">
                            <Sparkles size={9} className="text-amber-600" /> Parsed
                          </span>
                        )}
                        {item.status === "committed" && (
                          <span className="text-[9px] bg-emerald-50 text-emerald-700 px-1.5 py-0.5 rounded-full font-bold uppercase shrink-0 flex items-center gap-0.5">
                            <CheckCircle2 size={9} /> Saved
                          </span>
                        )}
                        {item.status === "failed" && (
                          <span className="text-[9px] bg-rose-50 text-rose-700 px-1.5 py-0.5 rounded-full font-bold uppercase shrink-0">
                            Error
                          </span>
                        )}

                        <button
                          onClick={(e) => handleRemoveItem(item.id, e)}
                          disabled={isBatchExtracting || item.status === "extracting"}
                          className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-md transition disabled:opacity-30 cursor-pointer"
                          title="Remove from queue"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Batch Actions */}
              <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-100">
                <button
                  onClick={handleExtractAllPending}
                  disabled={isBatchExtracting || queue.filter((q) => q.status === "pending" || q.status === "failed").length === 0}
                  className="py-2 px-3 bg-indigo-600 hover:bg-indigo-700 text-white text-[11px] font-extrabold rounded-lg flex items-center justify-center gap-1.5 transition disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                >
                  {isBatchExtracting ? (
                    <>
                      <Loader2 size={12} className="animate-spin" /> Parsing...
                    </>
                  ) : (
                    <>
                      <Play size={12} /> Extract Pending ({queue.filter((q) => q.status === "pending" || q.status === "failed").length})
                    </>
                  )}
                </button>

                <button
                  onClick={handleCommitAllVerified}
                  disabled={isBatchExtracting || queue.filter((q) => q.status === "success").length === 0}
                  className="py-2 px-3 bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-extrabold rounded-lg flex items-center justify-center gap-1.5 transition disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                >
                  <CheckCircle2 size={12} /> Commit All ({queue.filter((q) => q.status === "success").length})
                </button>
              </div>

            </div>
          ) : (
            <div className="h-44 border border-dashed border-slate-100 rounded-xl flex flex-col items-center justify-center text-center p-4 bg-slate-50/40">
              <ImageIcon size={28} className="text-slate-300 mb-1.5" />
              <p className="text-xs font-semibold text-slate-500">Queue is empty</p>
              <p className="text-[10px] text-slate-400 mt-0.5">Upload images of lotto results to populate and predict.</p>
            </div>
          )}

        </div>

        {/* Right panel: Verification & Fields */}
        <div className="xl:col-span-7 bg-slate-50 rounded-xl p-4 border border-slate-100 flex flex-col justify-between min-h-[300px]">
          
          {selectedItem ? (
            <div className="space-y-4 animate-fadeIn flex flex-col h-full justify-between">
              
              {/* Selected Item header */}
              <div className="flex items-center justify-between border-b border-slate-200 pb-2.5">
                <span className="text-xs font-bold text-slate-700 flex items-center gap-1.5 min-w-0">
                  <ShieldCheck className={selectedItem.status === "committed" ? "text-emerald-500" : "text-indigo-500"} size={16} /> 
                  <span className="truncate">{selectedItem.file.name}</span>
                </span>
                
                <span className={`text-[10px] px-2 py-0.5 rounded font-bold uppercase ${
                  selectedItem.status === "committed" 
                    ? "bg-emerald-50 text-emerald-700" 
                    : selectedItem.status === "success"
                      ? "bg-amber-50 text-amber-700"
                      : selectedItem.status === "failed"
                        ? "bg-rose-50 text-rose-700"
                        : selectedItem.status === "extracting"
                          ? "bg-indigo-50 text-indigo-700 animate-pulse"
                          : "bg-slate-100 text-slate-600"
                }`}>
                  {selectedItem.status}
                </span>
              </div>

              {/* Status Specific Renderings */}
              {selectedItem.status === "pending" && (
                <div className="flex-1 flex flex-col items-center justify-center text-center p-6 space-y-3">
                  <img
                    src={selectedItem.preview}
                    alt="Preview"
                    className="max-h-24 rounded border border-slate-200 object-contain shadow-xs"
                    referrerPolicy="no-referrer"
                  />
                  <div>
                    <h3 className="text-xs font-bold text-slate-700">Drawing Ready for Scan</h3>
                    <p className="text-[10px] text-slate-400 mt-1 max-w-[240px]">
                      Extract this lotto result to verify numbers and instantly forecast the next game winning numbers.
                    </p>
                  </div>
                  <button
                    onClick={() => extractItem(selectedItem.id, (step) => setLoadingStep(step))}
                    className="py-1.5 px-4 bg-indigo-600 hover:bg-indigo-700 text-white text-[11px] font-extrabold rounded-lg flex items-center justify-center gap-1 transition cursor-pointer"
                  >
                    <Sparkles size={11} /> Extract Draw & Predict Next
                  </button>
                </div>
              )}

              {selectedItem.status === "extracting" && (
                <div className="flex-1 flex flex-col items-center justify-center text-center p-6 space-y-3">
                  <Loader2 size={32} className="text-indigo-600 animate-spin" />
                  <div className="space-y-1">
                    <p className="text-xs font-bold text-indigo-900">Gemini OCR & Forecast Running</p>
                    <p className="text-[10px] text-indigo-500 font-medium transition-all duration-300 min-h-[14px]">
                      {loadingSteps[loadingStep]}
                    </p>
                  </div>
                </div>
              )}

              {selectedItem.status === "failed" && (
                <div className="flex-1 flex flex-col items-center justify-center text-center p-6 space-y-2">
                  <AlertTriangle size={28} className="text-rose-500" />
                  <div className="space-y-1">
                    <p className="text-xs font-bold text-rose-900">AI Extraction Failed</p>
                    <p className="text-[10px] text-rose-600 bg-rose-50 border border-rose-100 p-2 rounded-lg max-w-sm font-mono text-left truncate-3-lines">
                      {selectedItem.error}
                    </p>
                  </div>
                  <button
                    onClick={() => extractItem(selectedItem.id, (step) => setLoadingStep(step))}
                    className="py-1.5 px-4 bg-slate-800 hover:bg-slate-900 text-white text-[11px] font-bold rounded-lg flex items-center justify-center gap-1 transition cursor-pointer mt-1"
                  >
                    <RotateCcw size={12} /> Retry Extraction
                  </button>
                </div>
              )}

              {/* Success or Committed Display (Editable Verification Fields + Instant Prediction Forecast) */}
              {(selectedItem.status === "success" || selectedItem.status === "committed") && selectedItem.extractedData && (
                <div className="space-y-4 flex-1">
                  
                  {/* Verification Fields */}
                  <div className="grid grid-cols-2 gap-3 text-xs">
                    <div>
                      <label className="block text-[10px] text-slate-400 font-bold uppercase">Game Name</label>
                      <input
                        type="text"
                        disabled={selectedItem.status === "committed"}
                        value={selectedItem.extractedData.gameName}
                        onChange={(e) => handleFieldChange({ gameName: e.target.value })}
                        className="w-full mt-1 px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-slate-800 font-semibold disabled:bg-slate-100 disabled:text-slate-500"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] text-slate-400 font-bold uppercase">Edition</label>
                      <input
                        type="text"
                        disabled={selectedItem.status === "committed"}
                        value={selectedItem.extractedData.edition}
                        onChange={(e) => handleFieldChange({ edition: e.target.value })}
                        className="w-full mt-1 px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-slate-800 font-semibold disabled:bg-slate-100 disabled:text-slate-500"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] text-slate-400 font-bold uppercase">Date</label>
                      <input
                        type="date"
                        disabled={selectedItem.status === "committed"}
                        value={selectedItem.extractedData.date}
                        onChange={(e) => handleFieldChange({ date: e.target.value })}
                        className="w-full mt-1 px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-slate-800 font-semibold disabled:bg-slate-100 disabled:text-slate-500"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] text-slate-400 font-bold uppercase">Draw Time</label>
                      <input
                        type="text"
                        disabled={selectedItem.status === "committed"}
                        value={selectedItem.extractedData.time}
                        onChange={(e) => handleFieldChange({ time: e.target.value })}
                        className="w-full mt-1 px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-slate-800 font-semibold disabled:bg-slate-100 disabled:text-slate-500"
                      />
                    </div>
                  </div>

                  {/* Number sequences */}
                  <div className="space-y-2 pt-2 border-t border-slate-200/60 text-xs">
                    
                    <div className="flex items-center gap-2">
                      <span className="w-14 text-[10px] text-slate-400 font-bold uppercase">Winning:</span>
                      <div className="flex gap-1">
                        {selectedItem.extractedData.winningNumbers.map((n, i) => (
                          <input
                            key={i}
                            type="number"
                            disabled={selectedItem.status === "committed"}
                            value={n || ""}
                            onChange={(e) => {
                              if (!selectedItem.extractedData) return;
                              const copy = [...selectedItem.extractedData.winningNumbers];
                              copy[i] = parseInt(e.target.value, 10) || 0;
                              handleFieldChange({ winningNumbers: copy });
                            }}
                            className="w-8 h-8 rounded-full bg-slate-950 border border-slate-850 text-white font-mono text-xs font-bold text-center flex items-center justify-center disabled:opacity-85"
                          />
                        ))}
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="w-14 text-[10px] text-slate-400 font-bold uppercase">Extra:</span>
                      <div className="flex gap-1">
                        {selectedItem.extractedData.extraNumbers.map((n, i) => (
                          <input
                            key={i}
                            type="number"
                            disabled={selectedItem.status === "committed"}
                            value={n || ""}
                            onChange={(e) => {
                              if (!selectedItem.extractedData) return;
                              const copy = [...selectedItem.extractedData.extraNumbers];
                              copy[i] = parseInt(e.target.value, 10) || 0;
                              handleFieldChange({ extraNumbers: copy });
                            }}
                            className="w-8 h-8 rounded-full bg-emerald-500 border border-emerald-600 text-white font-mono text-xs font-bold text-center flex items-center justify-center disabled:opacity-85"
                          />
                        ))}
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="w-14 text-[10px] text-slate-400 font-bold uppercase">Machine:</span>
                      <div className="flex gap-1">
                        {selectedItem.extractedData.machineNumbers.map((n, i) => (
                          <input
                            key={i}
                            type="number"
                            disabled={selectedItem.status === "committed"}
                            value={n || ""}
                            onChange={(e) => {
                              if (!selectedItem.extractedData) return;
                              const copy = [...selectedItem.extractedData.machineNumbers];
                              copy[i] = parseInt(e.target.value, 10) || 0;
                              handleFieldChange({ machineNumbers: copy });
                            }}
                            className="w-8 h-8 rounded-full bg-slate-200 border border-slate-300 text-slate-700 font-mono text-xs font-bold text-center flex items-center justify-center disabled:opacity-85"
                          />
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* 🎯 Instant Next Game Predicted Winning Numbers Card */}
                  {instantPrediction && (
                    <div className="p-3.5 bg-gradient-to-r from-amber-500/10 via-amber-500/5 to-indigo-50 border border-amber-300/70 rounded-xl space-y-2.5 shadow-xs">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5">
                          <span className="p-1 bg-amber-500 text-white rounded-md shrink-0 shadow-xs">
                            <Sparkles size={13} />
                          </span>
                          <div>
                            <span className="text-[11px] font-black uppercase text-amber-900 tracking-tight block">
                              Predicted Next Winning Numbers
                            </span>
                            <span className="text-[9px] text-amber-700 font-medium">
                              Forecast for {selectedItem.extractedData.gameName} • Target Ed. {instantPrediction.nextEdition}
                            </span>
                          </div>
                        </div>
                        <span className="text-[9px] bg-amber-100 text-amber-800 font-bold px-2 py-0.5 rounded-full uppercase">
                          Next Draw
                        </span>
                      </div>

                      {/* 5 Forecast Winning Numbers */}
                      <div className="flex items-center gap-2 flex-wrap pt-0.5">
                        <div className="flex items-center gap-1.5">
                          {instantPrediction.predictedWinningNumbers.map((num) => (
                            <span
                              key={`inst-win-${num}`}
                              className="w-8 h-8 rounded-full bg-gradient-to-br from-amber-400 to-amber-500 text-slate-950 font-black text-xs flex items-center justify-center shadow-xs border border-amber-300 ring-1 ring-amber-400/40"
                            >
                              {num}
                            </span>
                          ))}
                        </div>

                        {instantPrediction.predictedExtraNumbers.length > 0 && (
                          <div className="flex items-center gap-1 pl-2 border-l border-amber-200">
                            <span className="text-[9px] font-bold text-emerald-700 uppercase">Extra:</span>
                            {instantPrediction.predictedExtraNumbers.map((num) => (
                              <span
                                key={`inst-ext-${num}`}
                                className="w-6 h-6 rounded-full bg-emerald-500 text-white font-bold text-[10px] flex items-center justify-center shadow-xs"
                              >
                                {num}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>

                      <p className="text-[9px] text-slate-600 leading-snug line-clamp-2">
                        {instantPrediction.reasoning}
                      </p>
                    </div>
                  )}

                  {/* Individual Committing UI */}
                  <div className="pt-2 border-t border-slate-200/60 flex flex-col sm:flex-row gap-2">
                    {selectedItem.status === "committed" ? (
                      <div className="flex-1 p-2.5 bg-emerald-50 border border-emerald-150 rounded-lg text-emerald-800 text-[11px] font-semibold flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5">
                          <CheckCircle2 size={15} className="text-emerald-600 shrink-0" />
                          <span>Committed to database & predictor active!</span>
                        </div>
                        <button
                          onClick={() => {
                            const element = document.getElementById("prediction-analytics-hub");
                            if (element) element.scrollIntoView({ behavior: "smooth", block: "center" });
                          }}
                          className="text-[10px] font-bold text-indigo-700 underline flex items-center gap-0.5 hover:text-indigo-900 cursor-pointer"
                        >
                          View in Hub <ArrowRight size={11} />
                        </button>
                      </div>
                    ) : isDuplicateOfExisting ? (
                      <div className="w-full space-y-2">
                        <div className="p-2.5 bg-amber-50 border border-amber-200 rounded-lg text-amber-850 text-[11px] font-semibold flex items-start gap-1.5">
                          <AlertTriangle size={14} className="text-amber-500 shrink-0 mt-0.5" />
                          <span>This draw already exists in the ledger database. Duplicate entries are blocked.</span>
                        </div>
                        <button
                          disabled
                          className="w-full py-2 bg-slate-200 text-slate-400 text-xs font-bold rounded-lg flex items-center justify-center gap-1.5 cursor-not-allowed"
                        >
                          <CheckCircle2 size={14} /> Blocked: Already in Ledger
                        </button>
                      </div>
                    ) : (
                      <div className="w-full grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <button
                          onClick={saveExtractedToLedger}
                          className="py-2 px-3 bg-slate-800 hover:bg-slate-900 text-white text-xs font-extrabold rounded-lg flex items-center justify-center gap-1.5 transition shadow-xs cursor-pointer"
                        >
                          <CheckCircle2 size={14} /> Save to Ledger
                        </button>
                        <button
                          onClick={saveAndOpenPredictionHub}
                          className="py-2 px-3 bg-gradient-to-r from-amber-500 to-indigo-600 hover:from-amber-600 hover:to-indigo-700 text-white text-xs font-black rounded-lg flex items-center justify-center gap-1.5 transition shadow-sm cursor-pointer"
                        >
                          <Sparkles size={14} /> Save & Predict Next Game
                        </button>
                      </div>
                    )}
                  </div>

                </div>
              )}

            </div>
          ) : (
            <div className="h-full flex flex-col items-center justify-center text-center p-6 space-y-2 flex-1">
              <ImageIcon size={36} className="text-slate-300" />
              <p className="text-xs font-bold text-slate-600">Pending Selection</p>
              <p className="text-[10px] text-slate-400 max-w-[220px] mx-auto">
                Once you upload files and select an item, its drawing details, OCR status, and next game winning numbers prediction will load here.
              </p>
            </div>
          )}

        </div>

      </div>

    </div>
  );
}
