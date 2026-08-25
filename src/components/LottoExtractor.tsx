import React, { useState, useRef, useMemo, useEffect } from "react";
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
  Info,
  Edit3,
  ZoomIn,
  ZoomOut,
  RotateCw,
  X,
  Maximize2,
  ExternalLink,
  HelpCircle
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
  isManualDraft?: boolean;
}

// Available lottery games list for fast dropdown selection
const COMMON_GAMES = [
  "BOMBALI SPECIAL",
  "MAD MAX",
  "MANO",
  "NATIONAL",
  "ROKEL RIVER",
  "PENINSULAR",
  "DAILY SPECIAL",
  "COTTON TREE",
  "TONKOLILI SPECIAL",
  "KOINADUGU SPECIAL",
  "KANGARI"
];

// Helper to intelligently infer game name and edition from file name
function inferSlipDetailsFromFilename(filename: string, existingResults: LottoResult[]): { gameName: string; edition: string; time: string } {
  const upper = filename.toUpperCase();
  
  // Extract number sequences for edition (e.g. 82361.jpg -> 82361)
  const numberMatch = filename.match(/\d{3,6}/);
  const edition = numberMatch ? numberMatch[0] : "";

  // Infer game name
  let gameName = "BOMBALI SPECIAL";
  if (upper.includes("BOMBALI")) gameName = "BOMBALI SPECIAL";
  else if (upper.includes("MAD") || upper.includes("MAX")) gameName = "MAD MAX";
  else if (upper.includes("MANO")) gameName = "MANO";
  else if (upper.includes("NATIONAL")) gameName = "NATIONAL";
  else if (upper.includes("ROKEL")) gameName = "ROKEL RIVER";
  else if (upper.includes("PENINSULAR")) gameName = "PENINSULAR";
  else if (upper.includes("COTTON")) gameName = "COTTON TREE";
  else if (upper.includes("TONKOLILI")) gameName = "TONKOLILI SPECIAL";
  else if (upper.includes("KOINADUGU")) gameName = "KOINADUGU SPECIAL";
  else if (upper.includes("KANGARI")) gameName = "KANGARI";
  else if (upper.includes("DAILY")) gameName = "DAILY SPECIAL";
  else if (existingResults.length > 0) {
    gameName = existingResults[0].gameName;
  }

  // Infer time
  let time = "18:30";
  if (upper.includes("11AM") || upper.includes("11_AM")) time = "11:00 AM";
  else if (upper.includes("2PM") || upper.includes("2_PM") || upper.includes("14")) time = "2:00 PM";
  else if (upper.includes("4PM") || upper.includes("4_PM") || upper.includes("16")) time = "4:00 PM";
  else if (upper.includes("6PM") || upper.includes("6_PM") || upper.includes("18")) time = "6:00 PM";
  else if (upper.includes("8PM") || upper.includes("8_PM") || upper.includes("20")) time = "8:00 PM";
  else if (upper.includes("9AM") || upper.includes("9_AM")) time = "9:00 AM";

  return { gameName, edition, time };
}

export default function LottoExtractor({ results, onExtractionComplete }: LottoExtractorProps) {
  const [queue, setQueue] = useState<ImageQueueItem[]>([]);
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isBatchExtracting, setIsBatchExtracting] = useState(false);
  const [globalError, setGlobalError] = useState<string | null>(null);
  const [loadingStep, setLoadingStep] = useState(0);
  const [autoExtractOnUpload, setAutoExtractOnUpload] = useState<boolean>(true);
  const [isApiKeyConfigured, setIsApiKeyConfigured] = useState<boolean | null>(null);

  // Modal zoom states for inspecting high-res slip image
  const [zoomModalItem, setZoomModalItem] = useState<ImageQueueItem | null>(null);
  const [zoomLevel, setZoomLevel] = useState<number>(1);
  const [rotationAngle, setRotationAngle] = useState<number>(0);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const winningInputRefs = useRef<(HTMLInputElement | null)[]>([]);

  // Rotating loading messages for extraction progress
  const loadingSteps = [
    "Analyzing image bounds & alignment...",
    "Scanning headers for Game Name...",
    "Locating Winning number series (yellow/blue balls)...",
    "Isolating Extra number series...",
    "Decoding Machine number series...",
    "Predicting next winning numbers with AI..."
  ];

  // Check health and API key configuration on mount
  useEffect(() => {
    async function checkHealth() {
      try {
        const res = await fetch("/api/health");
        if (res.ok) {
          const data = await res.json();
          setIsApiKeyConfigured(data.keyConfigured ?? false);
        }
      } catch (err) {
        console.warn("Health check error:", err);
      }
    }
    checkHealth();
  }, []);

  // Selected queue item
  const selectedItem = useMemo(() => {
    return queue.find((item) => item.id === selectedItemId) || null;
  }, [queue, selectedItemId]);

  // Instant next game winning numbers prediction computed dynamically for the selected extracted result
  const instantPrediction = useMemo<PredictionData | null>(() => {
    if (!selectedItem || !selectedItem.extractedData) return null;
    const itemData = selectedItem.extractedData;
    
    // Only calculate if at least 3 winning numbers are non-zero
    const validWinningCount = (itemData.winningNumbers || []).filter((n) => n > 0).length;
    if (validWinningCount < 3) return null;

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
    if (!cur.gameName || !cur.date || !cur.time) return false;
    return results.some(
      (r) =>
        r.gameName.trim().toLowerCase() === cur.gameName.trim().toLowerCase() &&
        normalizeDateToYMD(r.date) === normalizeDateToYMD(cur.date) &&
        r.time.trim().toLowerCase() === cur.time.trim().toLowerCase()
    );
  }, [selectedItem, results]);

  // Convert a queue item into a manual editable draft with smart inferencing
  const convertToManualDraft = (item: ImageQueueItem): ImageQueueItem => {
    const inferred = inferSlipDetailsFromFilename(item.file.name, results);
    const today = new Date().toISOString().split("T")[0];

    const draftData: LottoResult = item.extractedData || {
      id: "lotto-manual-" + Date.now() + "-" + Math.random().toString(36).substr(2, 4),
      gameName: inferred.gameName,
      edition: inferred.edition || "1",
      date: today,
      time: inferred.time || "18:30",
      winningNumbers: [0, 0, 0, 0, 0],
      extraNumbers: [0, 0],
      machineNumbers: [0, 0, 0, 0, 0],
    };

    return {
      ...item,
      status: "success",
      error: undefined,
      isManualDraft: true,
      extractedData: draftData,
    };
  };

  // Turn a single item in queue into editable manual mode
  const handleMakeManual = (itemId: string) => {
    setQueue((prev) =>
      prev.map((q) => (q.id === itemId ? convertToManualDraft(q) : q))
    );
    setSelectedItemId(itemId);
  };

  // Convert all items in queue that are failed or pending to manual drafts at once
  const handleConvertAllToManual = () => {
    setQueue((prev) =>
      prev.map((q) => (q.status === "failed" || q.status === "pending" ? convertToManualDraft(q) : q))
    );
  };

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
        const { optimizedBase64 } = await optimizeImageForOcr(file, 1600, 0.86);
        return {
          id: "img-" + Date.now() + "-" + Math.random().toString(36).substr(2, 5),
          file,
          preview: optimizedBase64,
          status: "pending" as const,
        };
      } catch (optErr) {
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

    // Auto-extract immediately if enabled AND API key is configured (or if status unknown)
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

      // 1. Attempt standard server/serverless /api/extract endpoint
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
        console.warn("API fetch error:", fetchErr);
      }

      if (response && response.ok) {
        const responseText = await response.text();
        let res: any;
        try {
          res = JSON.parse(responseText);
        } catch {
          throw new Error("Invalid response format from server.");
        }

        if (res.keyMissing) {
          setIsApiKeyConfigured(false);
        }

        if (!res.success) {
          throw new Error(res.error || "Unable to extract structured lottery data from slip image.");
        }

        if (res.data) {
          setIsApiKeyConfigured(true);
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
      } else {
        // Direct client fallback attempt
        const clientFallback = await directClientExtract(item.preview, item.file.type);
        if (clientFallback) {
          extractedResult = clientFallback;
        } else {
          throw new Error("AI service not reachable. Configure GEMINI_API_KEY in Settings > Secrets or transcribe manually.");
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
                  isManualDraft: false,
                  extractedData: extractedResult!,
                }
              : q
          )
        );
        return true;
      } else {
        throw new Error("No structured lotto data returned.");
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

  // Run extraction sequentially on all pending/failed items in the queue
  const handleExtractAllPending = async () => {
    const pendingItems = queue.filter((q) => q.status === "pending" || q.status === "failed");
    if (pendingItems.length === 0 || isBatchExtracting) return;

    setIsBatchExtracting(true);
    setGlobalError(null);

    for (let i = 0; i < pendingItems.length; i++) {
      const item = pendingItems[i];
      setSelectedItemId(item.id);
      await extractItem(item.id, (step) => setLoadingStep(step));
      if (i < pendingItems.length - 1) {
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
    }

    setIsBatchExtracting(false);
  };

  // Commit a single selected, verified result to the ledger
  const saveExtractedToLedger = () => {
    if (selectedItem && selectedItem.extractedData && selectedItem.status === "success") {
      // Validate winning numbers
      const nonZeroWinning = selectedItem.extractedData.winningNumbers.filter((n) => n > 0);
      if (nonZeroWinning.length === 0) {
        setGlobalError("Please input the 5 winning numbers for this draw before saving.");
        return;
      }

      const success = onExtractionComplete(selectedItem.extractedData);
      if (success !== false) {
        setQueue((prev) =>
          prev.map((q) => (q.id === selectedItem.id ? { ...q, status: "committed" } : q))
        );
        setGlobalError(null);
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

        // Skip items with zero winning numbers
        if (data.winningNumbers.every((n) => n === 0)) return;

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

  // Auto-focus next input when 2 digits are entered
  const handleWinningNumberChange = (index: number, valStr: string) => {
    if (!selectedItem || !selectedItem.extractedData) return;
    const val = parseInt(valStr, 10);
    const num = isNaN(val) ? 0 : Math.min(Math.max(val, 0), 90);
    const copy = [...selectedItem.extractedData.winningNumbers];
    copy[index] = num;
    handleFieldChange({ winningNumbers: copy });

    // If 2 digits were typed and there's a next input, focus it automatically
    if (valStr.length >= 2 && index < 4 && winningInputRefs.current[index + 1]) {
      winningInputRefs.current[index + 1]?.focus();
    }
  };

  const pendingOrFailedCount = queue.filter((q) => q.status === "pending" || q.status === "failed").length;
  const verifiedCount = queue.filter((q) => q.status === "success" && q.extractedData).length;

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-4 sm:p-5 space-y-4 w-full flex flex-col" id="lotto-extractor-container">
      
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
        <div>
          <h2 className="text-md font-bold text-slate-800 flex items-center gap-1.5">
            <Sparkles size={18} className="text-indigo-600 shrink-0" /> Batch Image Bulletin Extractor & Predictor
          </h2>
          <p className="text-[11px] text-slate-500 mt-0.5">
            Upload new lottery screenshots to automatically parse results or transcribe tickets with instant prediction forecasting.
          </p>
        </div>
        
        <div className="flex items-center gap-2.5 self-start sm:self-auto flex-wrap">
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
              Auto-Extract on Upload
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

      {/* Standby / API Key guidance banner */}
      {isApiKeyConfigured === false && (
        <div className="p-3 bg-amber-50/80 border border-amber-200/80 rounded-xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs text-amber-900 shadow-2xs">
          <div className="flex items-start gap-2.5 min-w-0">
            <Info size={16} className="text-amber-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-bold text-[11px]">AI Extraction Notice</p>
              <p className="text-[11px] text-amber-800 leading-relaxed">
                Add your <code className="bg-amber-100/90 text-amber-900 px-1 py-0.5 rounded font-mono font-bold text-[10px]">GEMINI_API_KEY</code> in Settings &gt; Secrets for 1-click automated OCR. In the meantime, you can easily transcribe uploaded slips manually with high-res zoom.
              </p>
            </div>
          </div>
          {pendingOrFailedCount > 0 && (
            <button
              onClick={handleConvertAllToManual}
              className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white text-[10px] font-extrabold rounded-lg shrink-0 transition flex items-center gap-1 cursor-pointer shadow-xs"
            >
              <Edit3 size={11} /> Convert {pendingOrFailedCount} to Manual Drafts
            </button>
          )}
        </div>
      )}

      {globalError && (
        <div className="p-3 bg-rose-50 border border-rose-100 rounded-lg flex items-start gap-2.5 text-xs text-rose-700 font-medium" id="extractor-error">
          <AlertTriangle size={16} className="shrink-0 text-rose-500 mt-0.5" />
          <div className="flex-1">{globalError}</div>
          <button onClick={() => setGlobalError(null)} className="text-rose-400 hover:text-rose-700">
            <X size={14} />
          </button>
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
                <div className="flex items-center gap-2">
                  {pendingOrFailedCount > 0 && (
                    <button
                      onClick={handleConvertAllToManual}
                      className="text-[10px] text-indigo-600 hover:text-indigo-800 font-bold flex items-center gap-0.5 cursor-pointer"
                      title="Convert all unparsed images to editable manual drafts"
                    >
                      <Edit3 size={11} /> Transcribe All
                    </button>
                  )}
                </div>
              </div>

              <div className="max-h-64 overflow-y-auto border border-slate-100 rounded-xl divide-y divide-slate-100 pr-1 scrollbar-thin">
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
                        <div className="relative group/thumb shrink-0">
                          <img
                            src={item.preview}
                            alt="Thumbnail"
                            className="w-10 h-10 object-cover rounded border border-slate-200 shrink-0 bg-slate-100"
                            referrerPolicy="no-referrer"
                          />
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setZoomModalItem(item);
                              setZoomLevel(1);
                              setRotationAngle(0);
                            }}
                            className="absolute inset-0 bg-slate-900/50 text-white rounded flex items-center justify-center opacity-0 group-hover/thumb:opacity-100 transition cursor-zoom-in"
                            title="Inspect high-resolution slip"
                          >
                            <ZoomIn size={12} />
                          </button>
                        </div>
                        <div className="min-w-0">
                          <p className="text-[11px] font-bold text-slate-700 truncate max-w-[130px]">
                            {item.file.name}
                          </p>
                          <p className="text-[10px] text-slate-400">
                            {(item.file.size / 1024).toFixed(1)} KB
                            {item.isManualDraft && <span className="text-amber-600 font-semibold ml-1">• Draft</span>}
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
                            <Sparkles size={9} className="text-amber-600" /> {item.isManualDraft ? "Draft" : "Parsed"}
                          </span>
                        )}
                        {item.status === "committed" && (
                          <span className="text-[9px] bg-emerald-50 text-emerald-700 px-1.5 py-0.5 rounded-full font-bold uppercase shrink-0 flex items-center gap-0.5">
                            <CheckCircle2 size={9} /> Saved
                          </span>
                        )}
                        {item.status === "failed" && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleMakeManual(item.id);
                            }}
                            className="text-[9px] bg-amber-50 hover:bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded-full font-bold uppercase shrink-0 flex items-center gap-0.5 cursor-pointer border border-amber-200 transition"
                            title="Click to transcribe manually"
                          >
                            <Edit3 size={8} /> Transcribe
                          </button>
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
                  disabled={isBatchExtracting || pendingOrFailedCount === 0}
                  className="py-2 px-3 bg-indigo-600 hover:bg-indigo-700 text-white text-[11px] font-extrabold rounded-lg flex items-center justify-center gap-1.5 transition disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                >
                  {isBatchExtracting ? (
                    <>
                      <Loader2 size={12} className="animate-spin" /> Parsing...
                    </>
                  ) : (
                    <>
                      <Play size={12} /> Scan Pending ({pendingOrFailedCount})
                    </>
                  )}
                </button>

                <button
                  onClick={handleCommitAllVerified}
                  disabled={isBatchExtracting || verifiedCount === 0}
                  className="py-2 px-3 bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-extrabold rounded-lg flex items-center justify-center gap-1.5 transition disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                >
                  <CheckCircle2 size={12} /> Commit All ({verifiedCount})
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
                
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      setZoomModalItem(selectedItem);
                      setZoomLevel(1);
                      setRotationAngle(0);
                    }}
                    className="text-[10px] bg-white border border-slate-200 hover:bg-slate-100 text-slate-700 px-2 py-0.5 rounded font-bold flex items-center gap-1 transition cursor-pointer"
                    title="Enlarge Slip View"
                  >
                    <Maximize2 size={10} /> View Ticket
                  </button>

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
                    {selectedItem.status === "success" && selectedItem.isManualDraft ? "Draft" : selectedItem.status}
                  </span>
                </div>
              </div>

              {/* Status Specific Renderings */}
              {selectedItem.status === "pending" && (
                <div className="flex-1 flex flex-col items-center justify-center text-center p-4 sm:p-6 space-y-3">
                  <div className="relative group cursor-pointer" onClick={() => { setZoomModalItem(selectedItem); setZoomLevel(1); setRotationAngle(0); }}>
                    <img
                      src={selectedItem.preview}
                      alt="Preview"
                      className="max-h-28 rounded border border-slate-200 object-contain shadow-xs bg-white"
                      referrerPolicy="no-referrer"
                    />
                    <div className="absolute inset-0 bg-slate-900/40 text-white rounded flex items-center justify-center opacity-0 group-hover:opacity-100 transition text-[10px] font-bold gap-1">
                      <ZoomIn size={12} /> Inspect Slip
                    </div>
                  </div>
                  <div>
                    <h3 className="text-xs font-bold text-slate-700">Drawing Ready</h3>
                    <p className="text-[10px] text-slate-400 mt-1 max-w-[260px]">
                      Extract numbers automatically with AI, or click Transcribe to type them directly from the ticket.
                    </p>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap justify-center">
                    <button
                      onClick={() => extractItem(selectedItem.id, (step) => setLoadingStep(step))}
                      className="py-1.5 px-3 bg-indigo-600 hover:bg-indigo-700 text-white text-[11px] font-extrabold rounded-lg flex items-center justify-center gap-1 transition cursor-pointer"
                    >
                      <Sparkles size={11} /> Scan with AI
                    </button>
                    <button
                      onClick={() => handleMakeManual(selectedItem.id)}
                      className="py-1.5 px-3 bg-white border border-slate-300 hover:bg-slate-100 text-slate-700 text-[11px] font-bold rounded-lg flex items-center justify-center gap-1 transition cursor-pointer"
                    >
                      <Edit3 size={11} /> Transcribe Manually
                    </button>
                  </div>
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
                <div className="flex-1 flex flex-col items-center justify-center text-center p-4 sm:p-6 space-y-3">
                  <div className="w-10 h-10 bg-rose-50 text-rose-500 rounded-full flex items-center justify-center">
                    <AlertTriangle size={20} />
                  </div>
                  <div className="space-y-1 max-w-sm">
                    <p className="text-xs font-bold text-rose-900">AI Extraction Not Available</p>
                    <p className="text-[10px] text-rose-600 bg-rose-50 border border-rose-100 p-2 rounded-lg font-mono text-left leading-relaxed">
                      {selectedItem.error || "The AI OCR endpoint could not parse this slip."}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap justify-center pt-1">
                    <button
                      onClick={() => handleMakeManual(selectedItem.id)}
                      className="py-1.5 px-3.5 bg-indigo-600 hover:bg-indigo-700 text-white text-[11px] font-extrabold rounded-lg flex items-center justify-center gap-1 transition cursor-pointer shadow-xs"
                    >
                      <Edit3 size={11} /> Transcribe Slip Manually
                    </button>
                    <button
                      onClick={() => extractItem(selectedItem.id, (step) => setLoadingStep(step))}
                      className="py-1.5 px-3 bg-white border border-slate-300 hover:bg-slate-100 text-slate-700 text-[11px] font-bold rounded-lg flex items-center justify-center gap-1 transition cursor-pointer"
                    >
                      <RotateCcw size={11} /> Retry AI Scan
                    </button>
                  </div>
                </div>
              )}

              {/* Success or Committed Display (Editable Verification Fields + Instant Prediction Forecast) */}
              {(selectedItem.status === "success" || selectedItem.status === "committed") && selectedItem.extractedData && (
                <div className="space-y-3.5 flex-1">
                  
                  {/* Thumbnail Banner with Quick Zoom */}
                  <div className="flex items-center justify-between p-2 bg-white rounded-lg border border-slate-200/80">
                    <div className="flex items-center gap-2 min-w-0">
                      <img
                        src={selectedItem.preview}
                        alt="Slip Thumbnail"
                        className="w-12 h-10 object-cover rounded border border-slate-200 cursor-pointer shrink-0"
                        onClick={() => { setZoomModalItem(selectedItem); setZoomLevel(1); setRotationAngle(0); }}
                        referrerPolicy="no-referrer"
                      />
                      <div className="min-w-0">
                        <p className="text-[10px] font-bold text-slate-600 truncate">Ticket Image Reference</p>
                        <p className="text-[9px] text-indigo-600 font-medium cursor-pointer hover:underline flex items-center gap-0.5" onClick={() => { setZoomModalItem(selectedItem); setZoomLevel(1); setRotationAngle(0); }}>
                          <ZoomIn size={10} /> Click to zoom and read slip numbers
                        </p>
                      </div>
                    </div>
                    {selectedItem.isManualDraft && (
                      <span className="text-[9px] bg-amber-100 text-amber-800 font-bold px-2 py-0.5 rounded-full uppercase">
                        Manual Transcribe Mode
                      </span>
                    )}
                  </div>

                  {/* Verification Fields */}
                  <div className="grid grid-cols-2 gap-2.5 text-xs">
                    <div>
                      <label className="block text-[10px] text-slate-400 font-bold uppercase">Game Name</label>
                      <input
                        type="text"
                        list="common-games-list"
                        disabled={selectedItem.status === "committed"}
                        value={selectedItem.extractedData.gameName}
                        onChange={(e) => handleFieldChange({ gameName: e.target.value.toUpperCase() })}
                        className="w-full mt-1 px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-slate-800 font-semibold disabled:bg-slate-100 disabled:text-slate-500 uppercase"
                      />
                      <datalist id="common-games-list">
                        {COMMON_GAMES.map((g) => (
                          <option key={g} value={g} />
                        ))}
                      </datalist>
                    </div>
                    <div>
                      <label className="block text-[10px] text-slate-400 font-bold uppercase">Edition #</label>
                      <input
                        type="text"
                        disabled={selectedItem.status === "committed"}
                        value={selectedItem.extractedData.edition}
                        onChange={(e) => handleFieldChange({ edition: e.target.value })}
                        className="w-full mt-1 px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-slate-800 font-semibold disabled:bg-slate-100 disabled:text-slate-500"
                        placeholder="e.g. 412"
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
                        placeholder="e.g. 18:30"
                      />
                    </div>
                  </div>

                  {/* Number sequences */}
                  <div className="space-y-2 pt-2 border-t border-slate-200/60 text-xs">
                    
                    <div className="flex items-center gap-2">
                      <span className="w-16 text-[10px] text-slate-500 font-bold uppercase">Winning (5):</span>
                      <div className="flex gap-1.5 flex-wrap">
                        {selectedItem.extractedData.winningNumbers.map((n, i) => (
                          <input
                            key={i}
                            ref={(el) => (winningInputRefs.current[i] = el)}
                            type="number"
                            min="1"
                            max="90"
                            disabled={selectedItem.status === "committed"}
                            value={n === 0 ? "" : n}
                            placeholder="-"
                            onChange={(e) => handleWinningNumberChange(i, e.target.value)}
                            className="w-8 h-8 rounded-full bg-slate-900 border border-slate-800 text-white font-mono text-xs font-bold text-center flex items-center justify-center focus:ring-2 focus:ring-indigo-500 disabled:opacity-85"
                          />
                        ))}
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="w-16 text-[10px] text-slate-500 font-bold uppercase">Extra (2):</span>
                      <div className="flex gap-1.5 flex-wrap">
                        {selectedItem.extractedData.extraNumbers.map((n, i) => (
                          <input
                            key={i}
                            type="number"
                            min="1"
                            max="90"
                            disabled={selectedItem.status === "committed"}
                            value={n === 0 ? "" : n}
                            placeholder="-"
                            onChange={(e) => {
                              if (!selectedItem.extractedData) return;
                              const copy = [...selectedItem.extractedData.extraNumbers];
                              copy[i] = parseInt(e.target.value, 10) || 0;
                              handleFieldChange({ extraNumbers: copy });
                            }}
                            className="w-8 h-8 rounded-full bg-emerald-500 border border-emerald-600 text-white font-mono text-xs font-bold text-center flex items-center justify-center focus:ring-2 focus:ring-emerald-400 disabled:opacity-85"
                          />
                        ))}
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="w-16 text-[10px] text-slate-500 font-bold uppercase">Machine (5):</span>
                      <div className="flex gap-1.5 flex-wrap">
                        {selectedItem.extractedData.machineNumbers.map((n, i) => (
                          <input
                            key={i}
                            type="number"
                            min="1"
                            max="90"
                            disabled={selectedItem.status === "committed"}
                            value={n === 0 ? "" : n}
                            placeholder="-"
                            onChange={(e) => {
                              if (!selectedItem.extractedData) return;
                              const copy = [...selectedItem.extractedData.machineNumbers];
                              copy[i] = parseInt(e.target.value, 10) || 0;
                              handleFieldChange({ machineNumbers: copy });
                            }}
                            className="w-8 h-8 rounded-full bg-slate-200 border border-slate-300 text-slate-700 font-mono text-xs font-bold text-center flex items-center justify-center focus:ring-2 focus:ring-slate-400 disabled:opacity-85"
                          />
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* 🎯 Instant Next Game Predicted Winning Numbers Card */}
                  {instantPrediction && (
                    <div className="p-3 bg-gradient-to-r from-amber-500/10 via-amber-500/5 to-indigo-50 border border-amber-300/70 rounded-xl space-y-2 shadow-2xs">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5">
                          <span className="p-1 bg-amber-500 text-white rounded-md shrink-0 shadow-xs">
                            <Sparkles size={12} />
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
                        <div className="flex items-center gap-1">
                          {instantPrediction.predictedWinningNumbers.map((num) => (
                            <span
                              key={`inst-win-${num}`}
                              className="w-7 h-7 rounded-full bg-gradient-to-br from-amber-400 to-amber-500 text-slate-950 font-black text-xs flex items-center justify-center shadow-xs border border-amber-300"
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
                                className="w-5 h-5 rounded-full bg-emerald-500 text-white font-bold text-[9px] flex items-center justify-center shadow-xs"
                              >
                                {num}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
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

      {/* 🔍 High-Resolution Slip Image Zoom Modal */}
      {zoomModalItem && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-xs flex items-center justify-center p-4 animate-fadeIn">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-4xl w-full max-h-[90vh] flex flex-col overflow-hidden shadow-2xl">
            
            {/* Modal Header */}
            <div className="p-3 sm:p-4 border-b border-slate-800 flex items-center justify-between text-white">
              <div className="flex items-center gap-2 min-w-0">
                <FileImage size={18} className="text-indigo-400 shrink-0" />
                <span className="text-xs sm:text-sm font-bold truncate">{zoomModalItem.file.name}</span>
                <span className="text-[10px] text-slate-400 hidden sm:inline">
                  ({(zoomModalItem.file.size / 1024).toFixed(1)} KB)
                </span>
              </div>

              {/* Controls */}
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setZoomLevel((z) => Math.max(z - 0.25, 0.75))}
                  className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg transition"
                  title="Zoom Out"
                >
                  <ZoomOut size={14} />
                </button>
                <span className="text-[10px] font-mono text-slate-300 w-10 text-center">
                  {Math.round(zoomLevel * 100)}%
                </span>
                <button
                  onClick={() => setZoomLevel((z) => Math.min(z + 0.25, 2.5))}
                  className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg transition"
                  title="Zoom In"
                >
                  <ZoomIn size={14} />
                </button>
                <button
                  onClick={() => setRotationAngle((r) => (r + 90) % 360)}
                  className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg transition"
                  title="Rotate 90°"
                >
                  <RotateCw size={14} />
                </button>
                <button
                  onClick={() => setZoomModalItem(null)}
                  className="p-1.5 bg-rose-500/20 hover:bg-rose-500/40 text-rose-300 rounded-lg transition ml-2"
                  title="Close Preview"
                >
                  <X size={16} />
                </button>
              </div>
            </div>

            {/* Modal Image Viewport */}
            <div className="flex-1 overflow-auto p-4 flex items-center justify-center min-h-[300px] bg-slate-950/50">
              <div
                style={{
                  transform: `scale(${zoomLevel}) rotate(${rotationAngle}deg)`,
                  transition: "transform 0.2s ease-out",
                }}
                className="origin-center"
              >
                <img
                  src={zoomModalItem.preview}
                  alt="Full Ticket View"
                  className="max-h-[65vh] max-w-full rounded shadow-lg object-contain"
                  referrerPolicy="no-referrer"
                />
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-3 bg-slate-950 border-t border-slate-800 flex items-center justify-between text-[11px] text-slate-400">
              <span>Use zoom and rotate controls to clearly inspect winning numbers.</span>
              <button
                onClick={() => {
                  handleMakeManual(zoomModalItem.id);
                  setZoomModalItem(null);
                }}
                className="px-3 py-1 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg font-bold flex items-center gap-1 transition"
              >
                <Edit3 size={12} /> Transcribe Numbers Now
              </button>
            </div>

          </div>
        </div>
      )}

    </div>
  );
}
