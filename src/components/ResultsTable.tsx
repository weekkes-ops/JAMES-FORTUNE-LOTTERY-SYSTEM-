import React, { useState, useMemo } from "react";
import { LottoResult } from "../types";
import { PRELOADED_LOTTO_RESULTS, GAME_COLORS } from "../data";
import { formatLottoDate, normalizeDateToYMD, parseDateString } from "../utils/dateUtils";
import { 
  Download, 
  Plus, 
  Trash2, 
  Edit3, 
  Search, 
  Filter, 
  RefreshCw, 
  Save, 
  X, 
  SlidersHorizontal,
  ClipboardCheck,
  ClipboardCopy,
  ChevronDown,
  ChevronUp,
  Layers,
  Sparkles,
  Info,
  Clock,
  Hash,
  Activity,
  Upload,
  AlertTriangle,
  FileSpreadsheet,
  Check
} from "lucide-react";
import * as XLSX from "xlsx";

interface ResultsTableProps {
  results: LottoResult[];
  onAddResult: (newResult: LottoResult) => boolean | void;
  onUpdateResult: (updatedResult: LottoResult) => boolean | void;
  onDeleteResult: (id: string) => void;
  onResetResults: () => void;
  onBulkImport?: (importedResults: LottoResult[], overwrite: boolean) => void;
  onDeleteDuplicates?: () => void;
}

export default function ResultsTable({
  results,
  onAddResult,
  onUpdateResult,
  onDeleteResult,
  onResetResults,
  onBulkImport,
  onDeleteDuplicates
}: ResultsTableProps) {
  // Count current duplicates based on gameName + date + time
  const currentDuplicatesCount = useMemo(() => {
    const seen = new Set<string>();
    let dupCount = 0;
    for (const r of results) {
      const key = `${r.gameName.trim().toLowerCase()}|${r.date.trim()}|${r.time.trim().toLowerCase()}`;
      if (seen.has(key)) {
        dupCount++;
      } else {
        seen.add(key);
      }
    }
    return dupCount;
  }, [results]);

  // Search & Filter state
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedGame, setSelectedGame] = useState("ALL");
  const [ballSearch, setBallSearch] = useState("");
  const [sortBy, setSortBy] = useState<"date" | "gameName" | "edition">("date");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");

  // Custom states for IntelliSense suggestions
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [activeSuggestionIndex, setActiveSuggestionIndex] = useState(0);
  const [isFocused, setIsFocused] = useState(false);

  // Interface for suggestions
  interface Suggestion {
    tag: string;
    displayText: string;
    category: string;
    description: string;
  }

  // Inline Editing & Adding Row state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Partial<LottoResult>>({});
  const [isAddingNew, setIsAddingNew] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // File Import state variables
  const [isImporting, setIsImporting] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [importedRowsPreview, setImportedRowsPreview] = useState<LottoResult[] | null>(null);
  const [importedFiles, setImportedFiles] = useState<{ name: string; size: number; rowCount: number }[]>([]);
  const [importError, setImportError] = useState<string | null>(null);
  const [importMode, setImportMode] = useState<"append" | "replace">("append");

  // New Row form state
  const [newForm, setNewForm] = useState<Omit<LottoResult, "id">>({
    gameName: "MAD MAX",
    date: new Date().toISOString().split("T")[0],
    time: "2PM",
    edition: "",
    winningNumbers: [0, 0, 0, 0, 0],
    extraNumbers: [0, 0],
    machineNumbers: [0, 0, 0, 0, 0]
  });

  // Query parser for IntelliSense Search
  interface ParsedTokens {
    game: string[];
    edition: string[];
    ball: number[];
    time: string[];
    parity: string[];
    ratio: string[];
    year: string[];
    month: string[];
    date: string[];
    text: string[];
  }

  const parsedSearch = useMemo(() => {
    const tokens: ParsedTokens = {
      game: [],
      edition: [],
      ball: [],
      time: [],
      parity: [],
      ratio: [],
      year: [],
      month: [],
      date: [],
      text: []
    };

    if (!searchTerm) return tokens;

    // Matches key:value or key:"spaced value" or key:'spaced value' or simple text
    const regex = /(?:(\w+):(?:"([^"]+)"|'([^']+)'|(\S+)))|(\S+)/g;
    let match;
    while ((match = regex.exec(searchTerm)) !== null) {
      if (match[1]) {
        const key = match[1].toLowerCase();
        const value = (match[2] || match[3] || match[4] || "").trim().toLowerCase();
        
        if (key === "game" || key === "g") {
          tokens.game.push(value);
        } else if (key === "edition" || key === "ed" || key === "e") {
          tokens.edition.push(value);
        } else if (key === "ball" || key === "num" || key === "n") {
          const num = parseInt(value, 10);
          if (!isNaN(num) && !tokens.ball.includes(num)) tokens.ball.push(num);
        } else if (key === "time" || key === "t") {
          tokens.time.push(value);
        } else if (key === "parity" || key === "p") {
          tokens.parity.push(value);
        } else if (key === "ratio" || key === "r") {
          tokens.ratio.push(value);
        } else if (key === "year" || key === "y") {
          tokens.year.push(value);
        } else if (key === "month" || key === "m") {
          tokens.month.push(value);
        } else if (key === "date" || key === "d") {
          tokens.date.push(value);
        } else {
          tokens.text.push(`${key}:${value}`);
        }
      } else if (match[5]) {
        const textValue = match[5].toLowerCase();
        if (textValue === "odd" || textValue === "even") {
          tokens.parity.push(textValue);
        } else if (textValue === "high" || textValue === "low") {
          tokens.ratio.push(textValue);
        } else {
          const isDatePattern = /^\d{4}[-/]\d{1,2}[-/]\d{1,2}$/.test(textValue);
          const isYearPattern = /^\d{4}$/.test(textValue);

          if (isDatePattern) {
            tokens.date.push(textValue);
          } else if (isYearPattern) {
            tokens.year.push(textValue);
          } else if (/^[0-9\s\-,\/]+$/.test(textValue) && /[0-9]/.test(textValue)) {
            // It is a sequence of numbers (e.g., 76-37-90-07-44, or just 76)
            const numMatches = textValue.match(/\b\d{1,2}\b/g);
            if (numMatches) {
              numMatches.forEach(m => {
                const num = parseInt(m, 10);
                if (!isNaN(num) && num >= 1 && num <= 90) {
                  if (!tokens.ball.includes(num)) {
                    tokens.ball.push(num);
                  }
                }
              });
            }
          } else {
            // Only add if it contains at least one letter or digit (skip lone dashes, commas, etc.)
            if (/[a-z0-9]/i.test(textValue)) {
              tokens.text.push(textValue);
            }
          }
        }
      }
    }

    return tokens;
  }, [searchTerm]);

  const searchedNumbers = parsedSearch.ball;

  const distinctGames = useMemo(() => {
    return Array.from(new Set(results.map(r => r.gameName)));
  }, [results]);

  const getSuggestions = (): Suggestion[] => {
    const words = searchTerm.split(/\s+/);
    const lastWord = words[words.length - 1] || "";
    const allSuggestions: Suggestion[] = [];

    if (lastWord.includes(":")) {
      const [key, val] = lastWord.split(":");
      const normalizedKey = key.toLowerCase();
      const valLower = (val || "").toLowerCase();

      if (normalizedKey === "game" || normalizedKey === "g") {
        distinctGames.forEach(g => {
          if (g.toLowerCase().includes(valLower)) {
            allSuggestions.push({
              tag: `game:"${g}"`,
              displayText: `game:"${g}"`,
              category: "Games Filter",
              description: `Filter events by game "${g}"`
            });
          }
        });
      } else if (normalizedKey === "time" || normalizedKey === "t") {
        const times = ["9AM", "11AM", "2PM", "4PM", "6PM", "8PM"];
        times.forEach(t => {
          if (t.toLowerCase().includes(valLower)) {
            allSuggestions.push({
              tag: `time:${t}`,
              displayText: `time:${t}`,
              category: "Time Filter",
              description: `Show draws drawn at ${t}`
            });
          }
        });
      } else if (normalizedKey === "parity" || normalizedKey === "p") {
        const parities = ["odd", "even"];
        parities.forEach(p => {
          if (p.toLowerCase().includes(valLower)) {
            allSuggestions.push({
              tag: `parity:${p}`,
              displayText: `parity:${p}`,
              category: "Parity Analyzer",
              description: `Highlight draws with mostly ${p} numbers`
            });
          }
        });
      } else if (normalizedKey === "ratio" || normalizedKey === "r") {
        const ratios = ["high", "low"];
        ratios.forEach(r => {
          if (r.toLowerCase().includes(valLower)) {
            allSuggestions.push({
              tag: `ratio:${r}`,
              displayText: `ratio:${r}`,
              category: "Distribution Analyzer",
              description: `Highlight draws with mostly ${r} range numbers`
            });
          }
        });
      } else if (normalizedKey === "ball" || normalizedKey === "num" || normalizedKey === "n") {
        const hotNumbers = [44, 70, 12, 19, 58, 62, 85, 33];
        hotNumbers.forEach(num => {
          if (num.toString().includes(valLower)) {
            allSuggestions.push({
              tag: `ball:${num}`,
              displayText: `ball:${num}`,
              category: "Ball Selector",
              description: `Draws containing ball number ${num}`
            });
          }
        });
      } else if (normalizedKey === "month" || normalizedKey === "m") {
        const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
        months.forEach(m => {
          if (m.toLowerCase().includes(valLower)) {
            allSuggestions.push({
              tag: `month:${m}`,
              displayText: `month:${m}`,
              category: "Calendar Filter",
              description: `Show draws in ${m}`
            });
          }
        });
      }
    } else {
      const lastWordLower = lastWord.toLowerCase();
      const tags = [
        { prefix: "game:", desc: "Filter by game name (e.g., game:Mano)" },
        { prefix: "edition:", desc: "Filter by edition number (e.g., edition:412)" },
        { prefix: "ball:", desc: "Draw containing specific ball (e.g., ball:44)" },
        { prefix: "time:", desc: "Filter by draw time (e.g., time:2PM)" },
        { prefix: "parity:", desc: "Analyze odd/even parity (parity:odd)" },
        { prefix: "ratio:", desc: "Analyze low/high split (ratio:high)" },
        { prefix: "year:", desc: "Filter by draw year (e.g., year:2026)" },
        { prefix: "month:", desc: "Filter by draw month (e.g., month:June)" },
        { prefix: "date:", desc: "Filter by explicit date (e.g., date:2026-06-26)" },
      ];

      tags.forEach(t => {
        if (t.prefix.includes(lastWordLower)) {
          allSuggestions.push({
            tag: t.prefix,
            displayText: t.prefix,
            category: "IntelliSense Token",
            description: t.desc
          });
        }
      });

      distinctGames.forEach(g => {
        if (g.toLowerCase().includes(lastWordLower) && lastWordLower.length >= 2) {
          allSuggestions.push({
            tag: `game:"${g}"`,
            displayText: `game:"${g}"`,
            category: "Quick Game Tag",
            description: `Filter by game "${g}"`
          });
        }
      });

      if ("odd".includes(lastWordLower) && lastWordLower.length >= 1) {
        allSuggestions.push({ tag: "parity:odd", displayText: "parity:odd", category: "Quick Parity Tag", description: "Search odd parity draws" });
      }
      if ("even".includes(lastWordLower) && lastWordLower.length >= 1) {
        allSuggestions.push({ tag: "parity:even", displayText: "parity:even", category: "Quick Parity Tag", description: "Search even parity draws" });
      }
    }

    return allSuggestions.slice(0, 8);
  };

  const activeSuggestions = getSuggestions();

  const handleSelectSuggestion = (suggestion: Suggestion) => {
    const words = searchTerm.split(/\s+/);
    words[words.length - 1] = suggestion.tag;
    setSearchTerm(words.join(" ") + " ");
    setActiveSuggestionIndex(0);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (activeSuggestions.length === 0) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveSuggestionIndex((prev) => (prev + 1) % activeSuggestions.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveSuggestionIndex((prev) => (prev - 1 + activeSuggestions.length) % activeSuggestions.length);
    } else if (e.key === "Enter") {
      e.preventDefault();
      handleSelectSuggestion(activeSuggestions[activeSuggestionIndex]);
    } else if (e.key === "Escape") {
      e.preventDefault();
      setShowSuggestions(false);
    }
  };

  // Export to Excel function using xlsx
  const handleExportExcel = () => {
    const dataToExport = filteredResults.map((r) => ({
      "Game Name": r.gameName,
      "Edition": r.edition,
      "Draw Date": r.date,
      "Draw Time": r.time,
      "Winning Ball 1": r.winningNumbers[0] || 0,
      "Winning Ball 2": r.winningNumbers[1] || 0,
      "Winning Ball 3": r.winningNumbers[2] || 0,
      "Winning Ball 4": r.winningNumbers[3] || 0,
      "Winning Ball 5": r.winningNumbers[4] || 0,
      "Extra Ball 1": r.extraNumbers[0] || 0,
      "Extra Ball 2": r.extraNumbers[1] || 0,
      "Machine Ball 1": r.machineNumbers[0] || 0,
      "Machine Ball 2": r.machineNumbers[1] || 0,
      "Machine Ball 3": r.machineNumbers[2] || 0,
      "Machine Ball 4": r.machineNumbers[3] || 0,
      "Machine Ball 5": r.machineNumbers[4] || 0,
      "Full Winning Seq": r.winningNumbers.join(", "),
      "Full Extra Seq": r.extraNumbers.join(", "),
      "Full Machine Seq": r.machineNumbers.join(", ")
    }));

    const worksheet = XLSX.utils.json_to_sheet(dataToExport);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Lotto Results");
    
    // Set column widths for clean viewing
    const maxLens = [15, 10, 12, 10, 12, 12, 12, 12, 12, 12, 12, 12, 12, 12, 12, 12, 15, 15, 15];
    worksheet["!cols"] = maxLens.map(w => ({ wch: w }));

    XLSX.writeFile(workbook, `James_Fortune_Lotto_Results_${new Date().toISOString().split("T")[0]}.xlsx`);
  };

  // Export to CSV
  const handleExportCSV = () => {
    const headers = [
      "Game Name", "Edition", "Date", "Time", 
      "Winning1", "Winning2", "Winning3", "Winning4", "Winning5",
      "Extra1", "Extra2", 
      "Machine1", "Machine2", "Machine3", "Machine4", "Machine5"
    ];
    
    const rows = filteredResults.map(r => [
      r.gameName,
      r.edition,
      r.date,
      r.time,
      ...r.winningNumbers,
      ...r.extraNumbers,
      ...r.machineNumbers
    ]);

    const csvContent = [headers.join(","), ...rows.map(row => row.map(cell => `"${cell}"`).join(","))].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `James_Fortune_Lotto_Results_${new Date().toISOString().split("T")[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleCopySequence = (result: LottoResult) => {
    const text = `${result.gameName} (Ed.${result.edition} - ${result.date}): WINNING: [${result.winningNumbers.join(", ")}] EXTRA: [${result.extraNumbers.join(", ")}] MACHINE: [${result.machineNumbers.join(", ")}]`;
    navigator.clipboard.writeText(text);
    setCopiedId(result.id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const startEditing = (result: LottoResult) => {
    setEditingId(result.id);
    setEditForm({ ...result });
  };

  const saveEdit = () => {
    if (editingId && editForm.gameName) {
      const normalizedForm = {
        ...editForm,
        date: editForm.date ? normalizeDateToYMD(editForm.date) : ""
      };
      const success = onUpdateResult(normalizedForm as LottoResult);
      if (success !== false) {
        setEditingId(null);
      }
    }
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditForm({});
  };

  const handleCreateNew = (e: React.FormEvent) => {
    e.preventDefault();
    const resultId = "lotto-user-" + Date.now();
    const completedResult: LottoResult = {
      ...newForm,
      id: resultId,
      date: normalizeDateToYMD(newForm.date)
    };
    const success = onAddResult(completedResult);
    if (success !== false) {
      setIsAddingNew(false);
      // Reset form
      setNewForm({
        gameName: "MAD MAX",
        date: new Date().toISOString().split("T")[0],
        time: "2PM",
        edition: "",
        winningNumbers: [0, 0, 0, 0, 0],
        extraNumbers: [0, 0],
        machineNumbers: [0, 0, 0, 0, 0]
      });
    }
  };

  // Drag and drop event handlers
  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      processImportFiles(e.dataTransfer.files);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      processImportFiles(e.target.files);
    }
  };

  const parseSingleFile = (file: File): Promise<{ fileName: string; results: LottoResult[] }> => {
    return new Promise((resolve, reject) => {
      const validExtensions = [".xlsx", ".xls", ".csv"];
      const ext = file.name.substring(file.name.lastIndexOf(".")).toLowerCase();
      
      if (!validExtensions.includes(ext)) {
        reject(new Error(`"${file.name}" has an invalid format. Please upload Excel (.xlsx, .xls) or CSV (.csv).`));
        return;
      }

      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const data = new Uint8Array(e.target?.result as ArrayBuffer);
          const workbook = XLSX.read(data, { type: "array" });
          const firstSheetName = workbook.SheetNames[0];
          const worksheet = workbook.Sheets[firstSheetName];
          
          // Convert worksheet to raw headers/rows
          const rawRows = XLSX.utils.sheet_to_json<any>(worksheet, { header: 1 });
          if (rawRows.length < 2) {
            throw new Error(`File "${file.name}" has no data rows to import.`);
          }

          // Get headers and convert them to lower-case trimmed strings
          const headers = rawRows[0].map((h: any) => String(h || "").trim().toLowerCase());
          const dataRows = rawRows.slice(1);

          const parsedResults: LottoResult[] = [];

          // Find header indices first to reuse across all rows
          let gameCol = -1;
          let editionCol = -1;
          let dateCol = -1;
          let timeCol = -1;
          const winningCols: number[] = [];
          const extraCols: number[] = [];
          const machineCols: number[] = [];
          let fullWinningCol = -1;
          let fullExtraCol = -1;
          let fullMachineCol = -1;

          headers.forEach((h: string, hIdx: number) => {
            const cleanH = h.toLowerCase().trim();
            if (["game name", "game", "gamename", "g"].includes(cleanH)) {
              gameCol = hIdx;
            } else if (["edition", "ed", "edition number", "e", "ed."].includes(cleanH)) {
              editionCol = hIdx;
            } else if (["draw date", "date", "drawdate", "d"].includes(cleanH)) {
              dateCol = hIdx;
            } else if (["draw time", "time", "drawtime", "t"].includes(cleanH)) {
              timeCol = hIdx;
            } else if (["full winning seq", "winning", "winning numbers", "winningnumbers", "winning seq", "winning_numbers", "full winning"].includes(cleanH)) {
              fullWinningCol = hIdx;
            } else if (["full extra seq", "extra", "extra numbers", "extranumbers", "extra seq", "extra_numbers", "bonus numbers", "full extra"].includes(cleanH)) {
              fullExtraCol = hIdx;
            } else if (["full machine seq", "machine", "machine numbers", "machinenumbers", "machine seq", "machine_numbers", "full machine"].includes(cleanH)) {
              fullMachineCol = hIdx;
            } else {
              // Extract any digit from header to see if it targets a specific ball index
              const digits = cleanH.match(/\d+/);
              const num = digits ? parseInt(digits[0], 10) : null;
              
              if (cleanH.includes("win") || cleanH.includes("w") || cleanH.startsWith("ball")) {
                if (num && num >= 1 && num <= 5 && !cleanH.includes("machine") && !cleanH.includes("extra")) {
                  winningCols[num - 1] = hIdx;
                }
              } else if (cleanH.includes("extra") || cleanH.includes("x") || cleanH.includes("bonus") || cleanH.includes("b")) {
                if (num && num >= 1 && num <= 2) {
                  extraCols[num - 1] = hIdx;
                }
              } else if (cleanH.includes("machine") || cleanH.includes("m") || cleanH.includes("mach")) {
                if (num && num >= 1 && num <= 5) {
                  machineCols[num - 1] = hIdx;
                }
              }
            }
          });

          dataRows.forEach((row: any, idx: number) => {
            if (!row || row.length === 0 || row.every((c: any) => c === undefined || c === null || c === "")) {
              return;
            }

            const gameName = gameCol !== -1 && row[gameCol] !== undefined ? String(row[gameCol]).trim() : (row[0] !== undefined ? String(row[0]).trim() : "MAD MAX");
            const edition = editionCol !== -1 && row[editionCol] !== undefined ? String(row[editionCol]).trim() : (row[1] !== undefined ? String(row[1]).trim() : `ED-${idx + 1}`);
            const date = dateCol !== -1 && row[dateCol] !== undefined ? String(row[dateCol]).trim() : (row[2] !== undefined ? String(row[2]).trim() : new Date().toISOString().split("T")[0]);
            const time = timeCol !== -1 && row[timeCol] !== undefined ? String(row[timeCol]).trim() : (row[3] !== undefined ? String(row[3]).trim() : "2PM");

            let winningNumbers: number[] = [];
            let extraNumbers: number[] = [];
            let machineNumbers: number[] = [];

            // 1. Try single column string sequences first
            if (fullWinningCol !== -1 && row[fullWinningCol] !== undefined && row[fullWinningCol] !== null) {
              winningNumbers = String(row[fullWinningCol]).split(/[\s,;-]+/).map(n => parseInt(n, 10)).filter(n => !isNaN(n) && n > 0);
            }
            if (fullExtraCol !== -1 && row[fullExtraCol] !== undefined && row[fullExtraCol] !== null) {
              extraNumbers = String(row[fullExtraCol]).split(/[\s,;-]+/).map(n => parseInt(n, 10)).filter(n => !isNaN(n) && n > 0);
            }
            if (fullMachineCol !== -1 && row[fullMachineCol] !== undefined && row[fullMachineCol] !== null) {
              machineNumbers = String(row[fullMachineCol]).split(/[\s,;-]+/).map(n => parseInt(n, 10)).filter(n => !isNaN(n) && n > 0);
            }

            // 2. Try individual mapped columns
            for (let i = 0; i < 5; i++) {
              if (winningNumbers[i] === undefined || winningNumbers[i] === 0) {
                const col = winningCols[i];
                if (col !== undefined && row[col] !== undefined && row[col] !== null) {
                  const val = parseInt(String(row[col]).trim(), 10);
                  if (!isNaN(val) && val > 0) {
                    winningNumbers[i] = val;
                  }
                }
              }
            }
            for (let i = 0; i < 2; i++) {
              if (extraNumbers[i] === undefined || extraNumbers[i] === 0) {
                const col = extraCols[i];
                if (col !== undefined && row[col] !== undefined && row[col] !== null) {
                  const val = parseInt(String(row[col]).trim(), 10);
                  if (!isNaN(val) && val > 0) {
                    extraNumbers[i] = val;
                  }
                }
              }
            }
            for (let i = 0; i < 5; i++) {
              if (machineNumbers[i] === undefined || machineNumbers[i] === 0) {
                const col = machineCols[i];
                if (col !== undefined && row[col] !== undefined && row[col] !== null) {
                  const val = parseInt(String(row[col]).trim(), 10);
                  if (!isNaN(val) && val > 0) {
                    machineNumbers[i] = val;
                  }
                }
              }
            }

            // Clean winning, extra, machine arrays of any undefineds/NaNs
            winningNumbers = winningNumbers.filter(n => !isNaN(n) && n > 0);
            extraNumbers = extraNumbers.filter(n => !isNaN(n) && n > 0);
            machineNumbers = machineNumbers.filter(n => !isNaN(n) && n > 0);

            // 3. Robust positional fallback: collect ALL numeric cells from left to right that are likely balls
            // We ignore GameName, Edition, Date, Time column indices if they are known, or skip the first 4 columns if unknown.
            const numbersInRow: number[] = [];
            for (let i = 0; i < row.length; i++) {
              if (i === gameCol || i === editionCol || i === dateCol || i === timeCol) {
                continue;
              }
              if (i === fullWinningCol || i === fullExtraCol || i === fullMachineCol) {
                continue;
              }
              // Also skip columns mapped to individual balls to avoid double-processing
              if (winningCols.includes(i) || extraCols.includes(i) || machineCols.includes(i)) {
                continue;
              }
              // Skip first 4 columns by default if no headers matched at all
              if (gameCol === -1 && editionCol === -1 && dateCol === -1 && timeCol === -1 && i < 4) {
                continue;
              }

              if (row[i] !== undefined && row[i] !== null && row[i] !== "") {
                const cellStr = String(row[i]).trim();
                // Check if it's a multi-number string (e.g., sequence "1, 2, 3")
                if (/^\d+([\s,;-]+\d+)+$/.test(cellStr)) {
                  const parts = cellStr.split(/[\s,;-]+/).map(n => parseInt(n, 10)).filter(n => !isNaN(n) && n > 0 && n <= 90);
                  numbersInRow.push(...parts);
                } else {
                  const val = parseInt(cellStr, 10);
                  if (!isNaN(val) && val > 0 && val <= 90) {
                    numbersInRow.push(val);
                  }
                }
              }
            }

            // If any ball arrays are still incomplete, let's back-fill them using the collected row numbers
            if (winningNumbers.length < 5 || extraNumbers.length < 2 || machineNumbers.length < 5) {
              // Combine whatever we parsed with the fallback numbers sequentially
              const combinedNumbers = [...winningNumbers, ...extraNumbers, ...machineNumbers, ...numbersInRow];
              // De-duplicate so we don't count the same cell twice if it was somehow captured both ways
              const uniqueNumbers: number[] = [];
              combinedNumbers.forEach(n => {
                if (n > 0 && n <= 90 && !uniqueNumbers.includes(n)) {
                  uniqueNumbers.push(n);
                }
              });

              if (uniqueNumbers.length >= 5) {
                winningNumbers = uniqueNumbers.slice(0, 5);
                if (uniqueNumbers.length >= 7) {
                  extraNumbers = uniqueNumbers.slice(5, 7);
                } else {
                  extraNumbers = uniqueNumbers.slice(5);
                }
                if (uniqueNumbers.length >= 12) {
                  machineNumbers = uniqueNumbers.slice(7, 12);
                } else {
                  machineNumbers = uniqueNumbers.slice(7);
                }
              } else if (numbersInRow.length >= 5) {
                // Sequential fallback directly
                winningNumbers = numbersInRow.slice(0, 5);
                if (numbersInRow.length >= 7) {
                  extraNumbers = numbersInRow.slice(5, 7);
                } else {
                  extraNumbers = numbersInRow.slice(5);
                }
                if (numbersInRow.length >= 12) {
                  machineNumbers = numbersInRow.slice(7, 12);
                } else {
                  machineNumbers = numbersInRow.slice(7);
                }
              }
            }

            // Final clean and pad of arrays
            const finalW = winningNumbers.filter(n => !isNaN(n) && n > 0);
            while (finalW.length < 5) finalW.push(0);

            const finalX = extraNumbers.filter(n => !isNaN(n) && n > 0);
            while (finalX.length < 2) finalX.push(0);

            const finalM = machineNumbers.filter(n => !isNaN(n) && n > 0);
            while (finalM.length < 5) finalM.push(0);

            parsedResults.push({
              id: `import-${Date.now()}-${idx}-${Math.random().toString(36).substr(2, 4)}`,
              gameName,
              edition,
              date: normalizeDateToYMD(date),
              time,
              winningNumbers: finalW.slice(0, 5),
              extraNumbers: finalX.slice(0, 2),
              machineNumbers: finalM.slice(0, 5)
            });
          });

          if (parsedResults.length === 0) {
            throw new Error("No rows could be successfully parsed.");
          }

          resolve({
            fileName: file.name,
            results: parsedResults
          });
        } catch (err: any) {
          reject(new Error(`Error parsing "${file.name}": ${err.message || "Invalid structure"}`));
        }
      };
      reader.onerror = () => reject(new Error(`Failed to read file: ${file.name}`));
      reader.readAsArrayBuffer(file);
    });
  };

  const processImportFiles = async (files: FileList | File[]) => {
    setImportError(null);
    const filesArray = Array.from(files);
    if (filesArray.length === 0) return;

    try {
      const resultsFromAllFiles = await Promise.all(
        filesArray.map(file => parseSingleFile(file))
      );

      // Combine results
      const combinedResults: LottoResult[] = [];
      const fileSummaryList: { name: string; size: number; rowCount: number }[] = [];

      resultsFromAllFiles.forEach((res) => {
        combinedResults.push(...res.results);
        
        // Find matching original file for size
        const originalFile = filesArray.find(f => f.name === res.fileName);
        fileSummaryList.push({
          name: res.fileName,
          size: originalFile?.size || 0,
          rowCount: res.results.length
        });
      });

      if (combinedResults.length === 0) {
        throw new Error("No valid lottery draw rows were found in any of the uploaded files.");
      }

      setImportedRowsPreview(combinedResults);
      setImportedFiles(fileSummaryList);
      setImportError(null);
    } catch (err: any) {
      console.error("Error processing multiple imported files:", err);
      setImportError(err.message || "Failed to parse files. Make sure files have valid headers and structures.");
    }
  };

  const confirmBulkImport = () => {
    if (importedRowsPreview && onBulkImport) {
      const overwrite = importMode === "replace";
      onBulkImport(importedRowsPreview, overwrite);
      
      // Reset state
      setIsImporting(false);
      setImportedRowsPreview(null);
      setImportedFiles([]);
      setImportError(null);
    }
  };

  // Toggle sorting
  const handleSort = (field: "date" | "gameName" | "edition") => {
    if (sortBy === field) {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    } else {
      setSortBy(field);
      setSortOrder("desc");
    }
  };

  // Extract unique game names for the filter dropdown
  const gameNames = Array.from(new Set(results.map((r) => r.gameName)));

  // Filter and sort lotto results
  const filteredResults = results
    .filter((r) => {
      // 1. Dropdown Game filter
      if (selectedGame !== "ALL" && r.gameName !== selectedGame) return false;
      
      // 2. Ball Search finder input
      if (ballSearch) {
        const searchBall = parseInt(ballSearch, 10);
        if (!isNaN(searchBall)) {
          const inWinning = r.winningNumbers.includes(searchBall);
          const inExtra = r.extraNumbers.includes(searchBall);
          const inMachine = r.machineNumbers.includes(searchBall);
          if (!inWinning && !inExtra && !inMachine) return false;
        }
      }

      // 3. IntelliSense Token filtering
      const { game, edition, ball, time, parity, ratio, year, month, date, text } = parsedSearch;

      if (game.length > 0) {
        const matched = game.some(g => r.gameName.toLowerCase().includes(g));
        if (!matched) return false;
      }

      if (edition.length > 0) {
        const matched = edition.some(ed => r.edition.toLowerCase().includes(ed));
        if (!matched) return false;
      }

      if (ball.length > 0) {
        const matched = ball.some(num => 
          r.winningNumbers.includes(num) || 
          r.extraNumbers.includes(num) || 
          r.machineNumbers.includes(num)
        );
        if (!matched) return false;
      }

      if (time.length > 0) {
        const matched = time.some(t => r.time.toLowerCase().includes(t));
        if (!matched) return false;
      }

      if (year.length > 0) {
        const matched = year.some(y => r.date.startsWith(y));
        if (!matched) return false;
      }

      if (month.length > 0) {
        const monthNumMap: { [key: string]: string } = {
          january: "01", february: "02", march: "03", april: "04", may: "05", june: "06",
          july: "07", august: "08", september: "09", october: "10", november: "11", december: "12",
          jan: "01", feb: "02", mar: "03", apr: "04", jun: "06", jul: "07", aug: "08", sep: "09", oct: "10", nov: "11", dec: "12"
        };
        const matched = month.some(m => {
          const mNum = monthNumMap[m] || m;
          const drawMonth = r.date.substring(5, 7);
          return drawMonth === mNum || (drawMonth.startsWith("0") && drawMonth.substring(1) === mNum);
        });
        if (!matched) return false;
      }

      if (date.length > 0) {
        const matched = date.some(d => r.date.includes(d));
        if (!matched) return false;
      }

      if (parity.length > 0) {
        const allBalls = [...r.winningNumbers, ...r.extraNumbers].filter(n => n > 0);
        const oddCount = allBalls.filter(n => n % 2 !== 0).length;
        const evenCount = allBalls.length - oddCount;
        
        const matched = parity.some(p => {
          if (p === "odd") return oddCount > evenCount;
          if (p === "even") return evenCount > oddCount;
          return true;
        });
        if (!matched) return false;
      }

      if (ratio.length > 0) {
        const allBalls = [...r.winningNumbers, ...r.extraNumbers].filter(n => n > 0);
        const lowCount = allBalls.filter(n => n <= 45).length;
        const highCount = allBalls.length - lowCount;
        
        const matched = ratio.some(ra => {
          if (ra === "low") return lowCount > highCount;
          if (ra === "high") return highCount > lowCount;
          return true;
        });
        if (!matched) return false;
      }

      if (text.length > 0) {
        const matched = text.every(txt => 
          r.gameName.toLowerCase().includes(txt) ||
          r.edition.toLowerCase().includes(txt) ||
          r.date.includes(txt) ||
          r.time.toLowerCase().includes(txt)
        );
        if (!matched) return false;
      }

      return true;
    })
    .sort((a, b) => {
      // If we are searching for balls, prioritize the draws with more matches
      if (parsedSearch.ball.length > 0) {
        const aMatches = parsedSearch.ball.filter(num => 
          a.winningNumbers.includes(num) || a.extraNumbers.includes(num) || a.machineNumbers.includes(num)
        ).length;
        const bMatches = parsedSearch.ball.filter(num => 
          b.winningNumbers.includes(num) || b.extraNumbers.includes(num) || b.machineNumbers.includes(num)
        ).length;
        
        if (aMatches !== bMatches) {
          return bMatches - aMatches; // Descending order of matches
        }
      }

      let comparison = 0;
      if (sortBy === "date") {
        comparison = a.date.localeCompare(b.date);
      } else if (sortBy === "gameName") {
        comparison = a.gameName.localeCompare(b.gameName);
      } else if (sortBy === "edition") {
        comparison = a.edition.localeCompare(b.edition);
      }
      return sortOrder === "asc" ? comparison : -comparison;
    });

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden" id="results-table-container">
      {/* Table Header / Actions */}
      <div className="p-5 border-b border-slate-100 bg-slate-50/50 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-slate-800 flex items-center gap-2">
            <Activity size={18} className="text-indigo-600" /> Lottery Results Ledger
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">Spreadsheet of extracted results. Double-check, edit values, or export.</p>
        </div>
        
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => {
              setIsAddingNew(true);
              setIsImporting(false);
            }}
            className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white font-medium text-xs rounded-lg flex items-center gap-1.5 transition shadow-sm cursor-pointer"
            id="add-row-btn"
          >
            <Plus size={14} /> Add Draw
          </button>

          <button
            onClick={() => {
              setIsImporting(!isImporting);
              setIsAddingNew(false);
            }}
            className={`px-3 py-1.5 font-semibold text-xs rounded-lg flex items-center gap-1.5 transition border cursor-pointer ${
              isImporting 
                ? "bg-violet-50 border-violet-200 text-violet-700 shadow-xs" 
                : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"
            }`}
            id="import-file-btn"
            title="Import Excel or CSV files"
          >
            <Upload size={14} /> Import File
          </button>

          {onDeleteDuplicates && (
            <button
              onClick={onDeleteDuplicates}
              className={`px-3 py-1.5 font-semibold text-xs rounded-lg flex items-center gap-1.5 transition border cursor-pointer ${
                currentDuplicatesCount > 0
                  ? "bg-amber-50 hover:bg-amber-100 border-amber-250 text-amber-900 font-bold shadow-xs"
                  : "bg-white border-slate-200 text-slate-500 hover:bg-slate-50"
              }`}
              title="Delete duplicate draw entries based on time (identical Game, Date, and Time)"
              id="delete-duplicates-btn"
            >
              <Trash2 size={14} className={currentDuplicatesCount > 0 ? "text-amber-600" : "text-slate-400"} />
              Delete Duplicates {currentDuplicatesCount > 0 && `(${currentDuplicatesCount})`}
            </button>
          )}
          
          <button
            onClick={handleExportExcel}
            className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-medium text-xs rounded-lg flex items-center gap-1.5 transition shadow-sm cursor-pointer"
            id="export-excel-btn"
          >
            <Download size={14} /> Export Excel
          </button>
          
          <button
            onClick={handleExportCSV}
            className="px-3 py-1.5 bg-slate-700 hover:bg-slate-800 text-white font-medium text-xs rounded-lg flex items-center gap-1.5 transition shadow-sm cursor-pointer"
            id="export-csv-btn"
          >
            <Download size={14} /> Export CSV
          </button>
          
          <button
            onClick={onResetResults}
            title="Reset ledger to original preloaded results and remove any imported Excel data"
            className="px-3 py-1.5 border border-red-200 text-red-600 hover:bg-red-50 font-medium text-xs rounded-lg flex items-center gap-1.5 transition shadow-sm cursor-pointer"
            id="reset-results-btn"
          >
            <RefreshCw size={14} /> Reset / Clear Imported
          </button>
        </div>
      </div>

      {/* Filters Ribbon */}
      <div className="p-4 border-b border-slate-100 bg-white grid grid-cols-1 sm:grid-cols-3 gap-3">
        {/* Search Input with Autocomplete Suggestions */}
        <div className="relative">
          <Search className="absolute left-3 top-2.5 text-indigo-500" size={16} />
          <input
            type="text"
            placeholder="Search game, date, or numbers (e.g. 76-37-90-07-44)..."
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e.target.value);
              setShowSuggestions(true);
            }}
            onFocus={() => {
              setIsFocused(true);
              setShowSuggestions(true);
            }}
            onBlur={() => {
              // Delay slightly so click events on suggestions can register
              setTimeout(() => {
                setIsFocused(false);
                setShowSuggestions(false);
              }, 200);
            }}
            onKeyDown={handleKeyDown}
            className="w-full pl-9 pr-8 py-2 border border-slate-200 rounded-lg text-sm bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition font-medium"
            id="search-input"
            autoComplete="off"
          />
          {searchTerm && (
            <button
              type="button"
              onClick={() => setSearchTerm("")}
              className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600"
            >
              <X size={15} />
            </button>
          )}

          {/* Floating IntelliSense Dropdown Popover */}
          {showSuggestions && isFocused && activeSuggestions.length > 0 && (
            <div className="absolute left-0 right-0 top-11 bg-white border border-slate-200/90 rounded-xl shadow-xl z-30 overflow-hidden divide-y divide-slate-100 max-h-80 overflow-y-auto animate-fadeIn" id="intellisense-suggestions">
              {/* Dropdown Header Info */}
              <div className="px-3 py-1.5 bg-slate-50/80 text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center justify-between">
                <span className="flex items-center gap-1"><Sparkles size={11} className="text-indigo-500 animate-pulse" /> IntelliSense Recommendations</span>
                <span>Press ↑↓ Enter</span>
              </div>
              
              {/* Suggestion list */}
              <div className="p-1 space-y-0.5">
                {activeSuggestions.map((suggestion, idx) => {
                  const isSelected = activeSuggestionIndex === idx;
                  return (
                    <div
                      key={idx}
                      onMouseDown={(e) => {
                        e.preventDefault(); // Prevent blur
                        handleSelectSuggestion(suggestion);
                      }}
                      onMouseEnter={() => setActiveSuggestionIndex(idx)}
                      className={`flex items-start justify-between py-1.5 px-3 rounded-lg cursor-pointer transition text-xs ${
                        isSelected 
                          ? "bg-indigo-600 text-white shadow-xs" 
                          : "hover:bg-slate-50 text-slate-700"
                      }`}
                    >
                      <div className="space-y-0.5 min-w-0">
                        <div className="font-mono font-bold flex items-center gap-1.5 truncate">
                          {suggestion.displayText}
                        </div>
                        <div className={`text-[10px] truncate max-w-[240px] ${isSelected ? "text-indigo-100 font-medium" : "text-slate-400"}`}>
                          {suggestion.description}
                        </div>
                      </div>
                      <span className={`text-[9px] font-extrabold uppercase px-1.5 py-0.5 rounded-full shrink-0 ml-2 ${
                        isSelected 
                          ? "bg-indigo-500 text-white" 
                          : "bg-slate-100 text-slate-500"
                      }`}>
                        {suggestion.category}
                      </span>
                    </div>
                  );
                })}
              </div>

              {/* Documentation Help Tip */}
              <div className="px-3 py-2 bg-indigo-50/30 text-[10px] text-indigo-900/80 font-medium flex items-start gap-1.5">
                <Info size={12} className="text-indigo-500 shrink-0 mt-0.5" />
                <div>
                  <span className="font-bold">Pro Tip:</span> Try typing <code className="bg-white px-1 py-0.5 border border-indigo-100 rounded font-bold font-mono">game:</code>, <code className="bg-white px-1 py-0.5 border border-indigo-100 rounded font-bold font-mono">ball:</code>, <code className="bg-white px-1 py-0.5 border border-indigo-100 rounded font-bold font-mono">parity:</code> or <code className="bg-white px-1 py-0.5 border border-indigo-100 rounded font-bold font-mono">ratio:</code> to search with full precision!
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Game Filter */}
        <div className="relative">
          <Filter className="absolute left-3 top-2.5 text-slate-400" size={16} />
          <select
            value={selectedGame}
            onChange={(e) => setSelectedGame(e.target.value)}
            className="w-full pl-9 pr-4 py-2 border border-slate-200 rounded-lg text-sm bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition appearance-none cursor-pointer"
            id="game-filter-select"
          >
            <option value="ALL">All Lottery Games</option>
            {gameNames.map((name) => (
              <option key={name} value={name}>{name}</option>
            ))}
          </select>
        </div>

        {/* Number Finder */}
        <div className="relative">
          <SlidersHorizontal className="absolute left-3 top-2.5 text-slate-400" size={16} />
          <input
            type="number"
            min="1"
            max="90"
            placeholder="Find ball number (1 - 90)..."
            value={ballSearch}
            onChange={(e) => setBallSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 border border-slate-200 rounded-lg text-sm bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition"
            id="ball-search-input"
          />
        </div>
      </div>

      {/* Add New Draw Modal / Segment */}
      {isAddingNew && (
        <form onSubmit={handleCreateNew} className="p-5 border-b border-slate-100 bg-indigo-50/20 animate-fadeIn" id="new-draw-form">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-sm text-indigo-900 flex items-center gap-1.5">
              <Plus size={16} /> Add Draw Result Manually
            </h3>
            <button 
              type="button" 
              onClick={() => setIsAddingNew(false)}
              className="p-1 hover:bg-slate-100 rounded-full text-slate-400 hover:text-slate-600 transition"
            >
              <X size={16} />
            </button>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Game Name</label>
              <select
                value={newForm.gameName}
                onChange={(e) => setNewForm({ ...newForm, gameName: e.target.value })}
                className="w-full px-3 py-1.5 border border-slate-200 rounded-lg text-sm bg-white"
                required
              >
                {Object.keys(GAME_COLORS).map((name) => (
                  <option key={name} value={name}>{name}</option>
                ))}
                <option value="CUSTOM GAME">CUSTOM GAME</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Edition</label>
              <input
                type="text"
                placeholder="e.g. 412"
                value={newForm.edition}
                onChange={(e) => setNewForm({ ...newForm, edition: e.target.value })}
                className="w-full px-3 py-1.5 border border-slate-200 rounded-lg text-sm bg-white"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Date</label>
              <input
                type="date"
                value={newForm.date}
                onChange={(e) => setNewForm({ ...newForm, date: e.target.value })}
                className="w-full px-3 py-1.5 border border-slate-200 rounded-lg text-sm bg-white"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Draw Time</label>
              <select
                value={newForm.time}
                onChange={(e) => setNewForm({ ...newForm, time: e.target.value })}
                className="w-full px-3 py-1.5 border border-slate-200 rounded-lg text-sm bg-white"
                required
              >
                <option value="9AM">9AM</option>
                <option value="11AM">11AM</option>
                <option value="2PM">2PM</option>
                <option value="4PM">4PM</option>
                <option value="6PM">6PM</option>
                <option value="8PM">8PM</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-4">
            {/* Winning Balls */}
            <div className="bg-white p-3 rounded-lg border border-slate-150">
              <span className="block text-xs font-semibold text-slate-700 mb-2">Winning Numbers (5)</span>
              <div className="flex gap-1.5">
                {newForm.winningNumbers.map((num, idx) => (
                  <input
                    key={idx}
                    type="number"
                    min="1"
                    max="90"
                    required
                    value={num || ""}
                    placeholder={`#${idx+1}`}
                    onChange={(e) => {
                      const updated = [...newForm.winningNumbers];
                      updated[idx] = parseInt(e.target.value, 10) || 0;
                      setNewForm({ ...newForm, winningNumbers: updated });
                    }}
                    className="w-12 h-10 border border-slate-200 rounded text-center font-semibold text-slate-800"
                  />
                ))}
              </div>
            </div>

            {/* Extra Balls */}
            <div className="bg-white p-3 rounded-lg border border-slate-150">
              <span className="block text-xs font-semibold text-slate-700 mb-2">Extra Numbers (2)</span>
              <div className="flex gap-2">
                {newForm.extraNumbers.map((num, idx) => (
                  <input
                    key={idx}
                    type="number"
                    min="1"
                    max="90"
                    required
                    value={num || ""}
                    placeholder={`#${idx+1}`}
                    onChange={(e) => {
                      const updated = [...newForm.extraNumbers];
                      updated[idx] = parseInt(e.target.value, 10) || 0;
                      setNewForm({ ...newForm, extraNumbers: updated });
                    }}
                    className="w-12 h-10 border border-slate-200 rounded text-center font-semibold text-emerald-700 bg-emerald-50/50"
                  />
                ))}
              </div>
            </div>

            {/* Machine Balls */}
            <div className="bg-white p-3 rounded-lg border border-slate-150">
              <span className="block text-xs font-semibold text-slate-700 mb-2">Machine Numbers (5)</span>
              <div className="flex gap-1.5">
                {newForm.machineNumbers.map((num, idx) => (
                  <input
                    key={idx}
                    type="number"
                    min="1"
                    max="90"
                    required
                    value={num || ""}
                    placeholder={`#${idx+1}`}
                    onChange={(e) => {
                      const updated = [...newForm.machineNumbers];
                      updated[idx] = parseInt(e.target.value, 10) || 0;
                      setNewForm({ ...newForm, machineNumbers: updated });
                    }}
                    className="w-12 h-10 border border-slate-200 rounded text-center font-semibold text-slate-600 bg-slate-50"
                  />
                ))}
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setIsAddingNew(false)}
              className="px-4 py-1.5 border border-slate-200 rounded-lg text-xs font-medium text-slate-600 hover:bg-slate-100 transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-semibold transition shadow-sm"
            >
              Save Results
            </button>
          </div>
        </form>
      )}

      {/* Spreadsheet / Excel / CSV File Import Section */}
      {isImporting && (
        <div className="p-5 border-b border-slate-100 bg-violet-50/10 animate-fadeIn" id="import-file-section">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-sm text-violet-900 flex items-center gap-1.5">
              <Upload size={16} className="text-violet-600" /> Import Ledger Spreadsheet File(s)
            </h3>
            <button 
              type="button" 
              onClick={() => {
                setIsImporting(false);
                setImportedRowsPreview(null);
                setImportedFiles([]);
                setImportError(null);
              }}
              className="p-1 hover:bg-slate-100 rounded-full text-slate-400 hover:text-slate-600 transition"
            >
              <X size={16} />
            </button>
          </div>

          {!importedRowsPreview ? (
            <div className="space-y-4">
              {/* Drag and Drop Zone */}
              <div 
                onDragEnter={handleDrag}
                onDragOver={handleDrag}
                onDragLeave={handleDrag}
                onDrop={handleDrop}
                className={`border-2 border-dashed rounded-xl p-8 text-center transition-all duration-200 cursor-pointer ${
                  dragActive 
                    ? "border-violet-500 bg-violet-50/50 scale-[1.01]" 
                    : "border-slate-200 bg-slate-50/50 hover:bg-slate-50 hover:border-violet-400"
                }`}
                onClick={() => document.getElementById("file-import-input")?.click()}
              >
                <input 
                  type="file" 
                  id="file-import-input" 
                  className="hidden" 
                  accept=".xlsx,.xls,.csv" 
                  multiple
                  onChange={handleFileSelect}
                />
                <div className="flex flex-col items-center justify-center gap-2">
                  <div className="w-12 h-12 rounded-full bg-violet-100 text-violet-600 flex items-center justify-center shadow-xs animate-bounce">
                    <FileSpreadsheet size={24} />
                  </div>
                  <div className="text-sm">
                    <span className="font-bold text-violet-700">Click to upload files</span> or drag and drop here
                  </div>
                  <p className="text-xs text-slate-400 font-medium max-w-sm">
                    Supports selecting and importing multiple Excel (.xlsx, .xls) and CSV (.csv) files at once.
                  </p>
                </div>
              </div>

              {/* Instructions block */}
              <div className="p-3.5 bg-slate-50 border border-slate-150 rounded-lg text-xs text-slate-500 space-y-1">
                <span className="font-bold text-slate-700 block mb-1">Expected Spreadsheet Structure:</span>
                <p>For best results, include columns with headers: <code className="bg-white border border-slate-200 px-1 py-0.5 rounded font-mono font-bold text-indigo-600">Game Name</code>, <code className="bg-white border border-slate-200 px-1 py-0.5 rounded font-mono font-bold text-indigo-600">Edition</code>, <code className="bg-white border border-slate-200 px-1 py-0.5 rounded font-mono font-bold text-indigo-600">Date</code>, <code className="bg-white border border-slate-200 px-1 py-0.5 rounded font-mono font-bold text-indigo-600">Time</code>.</p>
                <p>You can use individual ball columns (e.g. <code className="bg-white px-1 py-0.5 rounded font-mono">Winning Ball 1</code>...<code className="bg-white px-1 py-0.5 rounded font-mono">5</code>) or a single sequence column like <code className="bg-white border border-slate-200 px-1 py-0.5 rounded font-mono font-bold text-indigo-600">Full Winning Seq</code> (e.g. "44, 70, 12, 19, 58").</p>
              </div>
            </div>
          ) : (
            /* PREVIEW AND SELECTION CONTAINER */
            <div className="space-y-4 animate-fadeIn">
              <div className="p-3.5 bg-emerald-50 border border-emerald-150 text-emerald-800 rounded-lg flex items-start gap-2.5 text-xs">
                <Check size={18} className="shrink-0 text-emerald-600 mt-0.5" />
                <div className="space-y-1.5 w-full">
                  <strong className="font-bold text-emerald-900">
                    {importedFiles.length > 1 ? "Files Parsed Successfully!" : "File Parsed Successfully!"}
                  </strong>
                  <p>
                    Parsed a total of <strong className="font-extrabold text-emerald-950">{importedRowsPreview.length} lottery draw event entries</strong> from <strong className="font-extrabold text-emerald-950">{importedFiles.length} file(s)</strong>. Please review the combined data preview below before adding to the ledger.
                  </p>
                  
                  {/* List of files with sizes */}
                  <div className="mt-2 border-t border-emerald-200/60 pt-2 space-y-1 max-h-24 overflow-y-auto">
                    {importedFiles.map((f, idx) => (
                      <div key={idx} className="flex justify-between items-center text-[10px] text-emerald-700 font-medium bg-white/40 px-2 py-1 rounded border border-emerald-100/50">
                        <span className="truncate max-w-[240px] font-bold">📄 {f.name}</span>
                        <span className="shrink-0 bg-emerald-100 text-emerald-800 px-1.5 py-0.5 rounded font-bold text-[9px]">
                          {(f.size / 1024).toFixed(1)} KB • {f.rowCount} rows
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Import options - radio buttons cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div 
                  className={`p-3 rounded-xl border flex items-start gap-3 cursor-pointer transition ${
                    importMode === "append" 
                      ? "border-violet-500 bg-violet-50/40 text-violet-900 font-semibold" 
                      : "border-slate-200 bg-white hover:bg-slate-50 text-slate-700"
                  }`}
                  onClick={() => setImportMode("append")}
                >
                  <input 
                    type="radio" 
                    name="import_mode" 
                    checked={importMode === "append"} 
                    onChange={() => setImportMode("append")}
                    className="mt-1 accent-violet-600 cursor-pointer"
                  />
                  <div>
                    <span className="font-bold text-xs block text-violet-950">Append to current ledger</span>
                    <span className="text-[10px] text-slate-400 mt-0.5 block font-medium">Safely adds the new draws alongside your existing {results.length} records.</span>
                  </div>
                </div>

                <div 
                  className={`p-3 rounded-xl border flex items-start gap-3 cursor-pointer transition ${
                    importMode === "replace" 
                      ? "border-red-550 bg-red-50/20 text-red-900 font-semibold" 
                      : "border-slate-200 bg-white hover:bg-slate-50 text-slate-700"
                  }`}
                  onClick={() => setImportMode("replace")}
                >
                  <input 
                    type="radio" 
                    name="import_mode" 
                    checked={importMode === "replace"} 
                    onChange={() => setImportMode("replace")}
                    className="mt-1 accent-red-600 cursor-pointer"
                  />
                  <div>
                    <span className="font-bold text-xs block text-red-700">Overwrite / Replace entire database</span>
                    <span className="text-[10px] text-slate-400 mt-0.5 block font-medium">Deletes all current entries and initializes the ledger exclusively from this spreadsheet.</span>
                  </div>
                </div>
              </div>

              {/* Parsed Rows Scroll Preview Table */}
              <div className="border border-slate-200 rounded-lg overflow-hidden bg-white max-h-64 overflow-y-auto shadow-3xs">
                <table className="w-full text-left text-xs divide-y divide-slate-100">
                  <thead className="bg-slate-50 text-slate-500 font-bold sticky top-0 border-b border-slate-150 z-10">
                    <tr>
                      <th className="px-3 py-2 text-[10px] uppercase">Game</th>
                      <th className="px-3 py-2 text-[10px] uppercase">Edition</th>
                      <th className="px-3 py-2 text-[10px] uppercase">Date/Time</th>
                      <th className="px-3 py-2 text-[10px] uppercase">Winning Numbers</th>
                      <th className="px-3 py-2 text-[10px] uppercase">Extra Numbers</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                    {importedRowsPreview.map((row, rIdx) => (
                      <tr key={rIdx} className="hover:bg-slate-50">
                        <td className="px-3 py-2 font-bold text-slate-900">{row.gameName}</td>
                        <td className="px-3 py-2 font-mono text-indigo-600">{row.edition}</td>
                        <td className="px-3 py-2 text-slate-400 font-medium">
                          {row.date} <span className="text-[10px] font-bold bg-slate-100 text-slate-500 px-1 rounded">{row.time}</span>
                        </td>
                        <td className="px-3 py-2">
                          <div className="flex gap-1">
                            {row.winningNumbers.map((n, nIdx) => (
                              <span key={nIdx} className="w-5 h-5 rounded-full bg-indigo-50 border border-indigo-100 font-mono text-[10px] font-bold text-indigo-700 flex items-center justify-center shrink-0">
                                {n}
                              </span>
                            ))}
                          </div>
                        </td>
                        <td className="px-3 py-2">
                          <div className="flex gap-1">
                            {row.extraNumbers.some(n => n > 0) ? (
                              row.extraNumbers.filter(n => n > 0).map((n, nIdx) => (
                                <span key={nIdx} className="w-5 h-5 rounded-full bg-emerald-50 border border-emerald-100 font-mono text-[10px] font-bold text-emerald-700 flex items-center justify-center shrink-0">
                                  {n}
                                </span>
                              ))
                            ) : (
                              <span className="text-slate-300 italic text-[10px]">None</span>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Actions panel */}
              <div className="flex items-center justify-between pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setImportedRowsPreview(null);
                    setImportedFiles([]);
                  }}
                  className="px-3 py-1.5 border border-slate-200 hover:bg-slate-50 rounded-lg text-xs font-semibold text-slate-600 hover:bg-slate-100 transition cursor-pointer"
                >
                  Upload different file(s)
                </button>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setIsImporting(false);
                      setImportedRowsPreview(null);
                      setImportedFiles([]);
                      setImportError(null);
                    }}
                    className="px-4 py-1.5 text-xs font-semibold text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={confirmBulkImport}
                    className={`px-4 py-1.5 text-xs font-bold text-white rounded-lg transition shadow-xs cursor-pointer ${
                      importMode === "replace" 
                        ? "bg-red-600 hover:bg-red-700" 
                        : "bg-violet-600 hover:bg-violet-700"
                    }`}
                  >
                    {importMode === "replace" ? "Overwrite & Import" : "Confirm Import"}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Import Error Banner */}
          {importError && (
            <div className="mt-4 p-3.5 bg-red-50 border border-red-150 text-red-800 rounded-lg flex items-start gap-2.5 text-xs animate-slideIn">
              <AlertTriangle size={18} className="shrink-0 text-red-600 mt-0.5" />
              <div className="space-y-1">
                <strong className="font-bold text-red-900">Import Failed</strong>
                <p>{importError}</p>
                <p className="text-[10px] text-red-600 mt-1">Please make sure the file contains appropriate lottery results headers or fits the default CSV format.</p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Main content spreadsheet view */}
      <div className="flex flex-col border-t border-slate-150">
        
        {/* Spreadsheet table */}
        <div className="flex-1 min-w-0">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse" id="results-data-table">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  <th className="py-3 px-4 min-w-[140px] cursor-pointer hover:bg-slate-100/80 transition" onClick={() => handleSort("gameName")}>
                    <div className="flex items-center gap-1">
                      Game {sortBy === "gameName" && (sortOrder === "asc" ? <ChevronUp size={12} /> : <ChevronDown size={12} />)}
                    </div>
                  </th>
                  <th className="py-3 px-4 min-w-[90px] cursor-pointer hover:bg-slate-100/80 transition" onClick={() => handleSort("edition")}>
                    <div className="flex items-center gap-1">
                      Edition {sortBy === "edition" && (sortOrder === "asc" ? <ChevronUp size={12} /> : <ChevronDown size={12} />)}
                    </div>
                  </th>
                  <th className="py-3 px-4 min-w-[130px] cursor-pointer hover:bg-slate-100/80 transition" onClick={() => handleSort("date")}>
                    <div className="flex items-center gap-1">
                      Date / Time {sortBy === "date" && (sortOrder === "asc" ? <ChevronUp size={12} /> : <ChevronDown size={12} />)}
                    </div>
                  </th>
                  <th className="py-3 px-4 min-w-[200px]">Winning Numbers (5)</th>
                  <th className="py-3 px-4 min-w-[100px]">Extra (2)</th>
                  <th className="py-3 px-4 min-w-[200px]">Machine Numbers (5)</th>
                  <th className="py-3 px-4 text-right min-w-[120px]">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm text-slate-700">

            {filteredResults.length === 0 ? (
              <tr>
                <td colSpan={7} className="py-12 text-center text-slate-400 font-medium">
                  No draw results found matching your current filters.
                </td>
              </tr>
            ) : (
              filteredResults.map((result) => {
                const isEditing = editingId === result.id;
                const gameBg = GAME_COLORS[result.gameName] || "from-slate-600 to-slate-700 border-slate-500";
                
                return (
                  <tr key={result.id} className={`hover:bg-slate-50/50 transition group ${isEditing ? "bg-indigo-50/10" : ""}`}>
                    {/* Game Name */}
                    <td className="py-3 px-4">
                      {isEditing ? (
                        <select
                          value={editForm.gameName}
                          onChange={(e) => setEditForm({ ...editForm, gameName: e.target.value })}
                          className="px-2 py-1 border border-slate-200 rounded text-xs bg-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
                        >
                          {Object.keys(GAME_COLORS).map((name) => (
                            <option key={name} value={name}>{name}</option>
                          ))}
                        </select>
                      ) : (
                        <div className="flex items-center gap-1.5">
                          <div className={`w-2.5 h-2.5 rounded-full bg-gradient-to-r ${gameBg}`} />
                          <span className="font-semibold text-slate-800">{result.gameName}</span>
                        </div>
                      )}
                    </td>

                    {/* Edition */}
                    <td className="py-3 px-4">
                      {isEditing ? (
                        <input
                          type="text"
                          value={editForm.edition || ""}
                          onChange={(e) => setEditForm({ ...editForm, edition: e.target.value })}
                          className="w-16 px-2 py-0.5 border border-slate-200 rounded text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500 font-medium"
                        />
                      ) : (
                        <span className="inline-flex items-center px-2 py-0.5 bg-slate-100 text-slate-600 rounded text-xs font-semibold">
                          Ed. {result.edition}
                        </span>
                      )}
                    </td>

                    {/* Date / Time */}
                    <td className="py-3 px-4">
                      {isEditing ? (
                        <div className="flex flex-col gap-1">
                          <input
                            type="date"
                            value={editForm.date || ""}
                            onChange={(e) => setEditForm({ ...editForm, date: e.target.value })}
                            className="px-1 py-0.5 border border-slate-200 rounded text-xs"
                          />
                          <select
                            value={editForm.time}
                            onChange={(e) => setEditForm({ ...editForm, time: e.target.value })}
                            className="px-1 py-0.5 border border-slate-200 rounded text-xs"
                          >
                            <option value="9AM">9AM</option>
                            <option value="11AM">11AM</option>
                            <option value="2PM">2PM</option>
                            <option value="4PM">4PM</option>
                            <option value="6PM">6PM</option>
                            <option value="8PM">8PM</option>
                          </select>
                        </div>
                      ) : (
                        <div className="flex flex-col">
                          <span className="text-xs font-medium text-slate-800">
                            {formatLottoDate(result.date)}
                          </span>
                          <span className="text-[10px] text-slate-400 font-bold tracking-wider uppercase mt-0.5">
                            {result.time} Draw
                          </span>
                        </div>
                      )}
                    </td>

                    {/* Winning Numbers */}
                    <td className="py-3 px-4">
                      {isEditing ? (
                        <div className="flex gap-1">
                          {(editForm.winningNumbers || []).map((num, idx) => (
                            <input
                              key={idx}
                              type="number"
                              min="1"
                              max="90"
                              value={num || ""}
                              onChange={(e) => {
                                const copy = [...(editForm.winningNumbers || [])];
                                copy[idx] = parseInt(e.target.value, 10) || 0;
                                setEditForm({ ...editForm, winningNumbers: copy });
                              }}
                              className="w-8 py-0.5 border border-slate-200 rounded text-center text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-indigo-500"
                            />
                          ))}
                        </div>
                      ) : (
                        <div className="flex gap-1.5">
                          {result.winningNumbers.map((num, idx) => {
                            const isMatched = searchedNumbers.includes(num);
                            return (
                              <span 
                                key={idx} 
                                className={`w-7 h-7 rounded-full font-mono text-xs flex items-center justify-center font-bold border shadow-sm transition-all duration-300 ${
                                  isMatched 
                                    ? "bg-amber-500 text-white border-amber-600 scale-110 ring-2 ring-amber-300/50" 
                                    : "bg-slate-900 text-white border-slate-800"
                                }`}
                              >
                                {num}
                              </span>
                            );
                          })}
                        </div>
                      )}
                    </td>

                    {/* Extra Numbers */}
                    <td className="py-3 px-4">
                      {isEditing ? (
                        <div className="flex gap-1">
                          {(editForm.extraNumbers || []).map((num, idx) => (
                            <input
                              key={idx}
                              type="number"
                              min="1"
                              max="90"
                              value={num || ""}
                              onChange={(e) => {
                                const copy = [...(editForm.extraNumbers || [])];
                                copy[idx] = parseInt(e.target.value, 10) || 0;
                                setEditForm({ ...editForm, extraNumbers: copy });
                              }}
                              className="w-8 py-0.5 border border-slate-200 rounded text-center text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-indigo-500"
                            />
                          ))}
                        </div>
                      ) : (
                        <div className="flex gap-1.5">
                          {result.extraNumbers.length > 0 ? (
                            result.extraNumbers.map((num, idx) => {
                              const isMatched = searchedNumbers.includes(num);
                              return (
                                <span 
                                  key={idx} 
                                  className={`w-7 h-7 rounded-full font-mono text-xs flex items-center justify-center font-bold border shadow-sm transition-all duration-300 ${
                                    isMatched 
                                      ? "bg-amber-500 text-white border-amber-600 scale-110 ring-2 ring-amber-300/50" 
                                      : "bg-emerald-500 text-white border-emerald-600"
                                  }`}
                                >
                                  {num}
                                </span>
                              );
                            })
                          ) : (
                            <span className="text-xs text-slate-300 italic">-</span>
                          )}
                        </div>
                      )}
                    </td>

                    {/* Machine Numbers */}
                    <td className="py-3 px-4">
                      {isEditing ? (
                        <div className="flex gap-1">
                          {(editForm.machineNumbers || []).map((num, idx) => (
                            <input
                              key={idx}
                              type="number"
                              min="1"
                              max="90"
                              value={num || ""}
                              onChange={(e) => {
                                const copy = [...(editForm.machineNumbers || [])];
                                copy[idx] = parseInt(e.target.value, 10) || 0;
                                setEditForm({ ...editForm, machineNumbers: copy });
                              }}
                              className="w-8 py-0.5 border border-slate-200 rounded text-center text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-indigo-500"
                            />
                          ))}
                        </div>
                      ) : (
                        <div className="flex gap-1.5">
                          {result.machineNumbers.length > 0 ? (
                            result.machineNumbers.map((num, idx) => {
                              const isMatched = searchedNumbers.includes(num);
                              return (
                                <span 
                                  key={idx} 
                                  className={`w-7 h-7 rounded-full font-mono text-xs flex items-center justify-center font-bold border shadow-sm transition-all duration-300 ${
                                    isMatched 
                                      ? "bg-amber-500 text-white border-amber-600 scale-110 ring-2 ring-amber-300/50" 
                                      : "bg-slate-100 text-slate-600 border-slate-200"
                                  }`}
                                >
                                  {num}
                                </span>
                              );
                            })
                          ) : (
                            <span className="text-xs text-slate-300 italic">No Machine Draw</span>
                          )}
                        </div>
                      )}
                    </td>

                    {/* Action buttons */}
                    <td className="py-3 px-4 text-right">
                      {isEditing ? (
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={saveEdit}
                            className="p-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-600 rounded transition"
                            title="Save Row"
                          >
                            <Save size={15} />
                          </button>
                          <button
                            onClick={cancelEdit}
                            className="p-1 bg-rose-50 hover:bg-rose-100 text-rose-600 rounded transition"
                            title="Cancel Edit"
                          >
                            <X size={15} />
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center justify-end gap-1.5 opacity-85 group-hover:opacity-100 transition">
                          <button
                            onClick={() => handleCopySequence(result)}
                            className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition"
                            title="Copy results string"
                          >
                            {copiedId === result.id ? (
                              <ClipboardCheck size={14} className="text-emerald-500" />
                            ) : (
                              <ClipboardCopy size={14} />
                            )}
                          </button>
                          <button
                            onClick={() => startEditing(result)}
                            className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition"
                            title="Edit Draw"
                          >
                            <Edit3 size={14} />
                          </button>
                          <button
                            onClick={() => onDeleteResult(result.id)}
                            className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition"
                            title="Delete Draw"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  </div>
      
      {/* Table Footer */}
      <div className="px-5 py-4 bg-slate-50 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500 font-medium">
        <span>Showing {filteredResults.length} of {results.length} draws total</span>
        <span>Use filters to search specific draw events or check ball hits.</span>
      </div>
    </div>
  );
}
