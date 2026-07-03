import React, { useState, useMemo } from "react";
import { LottoResult } from "../types";
import { 
  Sparkles, 
  HelpCircle, 
  Search, 
  TrendingUp, 
  Eye, 
  EyeOff, 
  Flame, 
  CornerDownRight, 
  ArrowRightLeft,
  BookOpen
} from "lucide-react";
import { BALL_MOVEMENT_DATA, parseNumbers } from "../utils/ballMovementData";

interface BallMovementGuideProps {
  results: LottoResult[];
}

interface BallData {
  number: number;
  primary: string;
  secondary: string;
}

export default function BallMovementGuide({ results }: BallMovementGuideProps) {
  const [selectedNumber, setSelectedNumber] = useState<number | null>(1);
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [filterLatestDraw, setFilterLatestDraw] = useState<boolean>(false);

  // Retrieve numbers from the latest drawn result across any game
  const latestDrawNumbers = useMemo(() => {
    if (results.length === 0) return new Set<number>();
    const sorted = [...results].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    const latest = sorted[0];
    const allNums = new Set<number>();
    latest.winningNumbers.forEach(n => allNums.add(n));
    latest.extraNumbers.forEach(n => allNums.add(n));
    latest.machineNumbers.forEach(n => allNums.add(n));
    return allNums;
  }, [results]);

  const latestDrawDetails = useMemo(() => {
    if (results.length === 0) return null;
    const sorted = [...results].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    return sorted[0];
  }, [results]);

  // Compute movement counters for currently selected ball
  const selectedMovement = useMemo(() => {
    if (!selectedNumber) return null;
    const data = BALL_MOVEMENT_DATA[selectedNumber];
    if (!data) return null;

    return {
      primaryRaw: data.primary,
      secondaryRaw: data.secondary,
      primaryParsed: parseNumbers(data.primary),
      secondaryParsed: parseNumbers(data.secondary),
    };
  }, [selectedNumber]);

  // Determine which cells should be displayed/filtered
  const ballsToRender = useMemo(() => {
    const arr: BallData[] = [];
    for (let i = 1; i <= 90; i++) {
      const d = BALL_MOVEMENT_DATA[i];
      arr.push({
        number: i,
        primary: d.primary,
        secondary: d.secondary,
      });
    }

    return arr.filter((b) => {
      // Apply search query
      if (searchQuery.trim() !== "") {
        const queryNum = parseInt(searchQuery, 10);
        if (!isNaN(queryNum)) {
          // If searching a number, check if it matches the cell itself OR any of its primary/secondary partners
          const inPrimary = parseNumbers(b.primary).includes(queryNum);
          const inSecondary = parseNumbers(b.secondary).includes(queryNum);
          if (b.number !== queryNum && !inPrimary && !inSecondary) {
            return false;
          }
        } else {
          // String match for formatted content
          const queryLower = searchQuery.toLowerCase();
          const matchesForm = 
            b.number.toString().includes(queryLower) ||
            b.primary.includes(queryLower) ||
            b.secondary.includes(queryLower);
          if (!matchesForm) return false;
        }
      }

      // Filter by latest draw numbers
      if (filterLatestDraw && latestDrawNumbers.size > 0) {
        if (!latestDrawNumbers.has(b.number)) {
          return false;
        }
      }

      return true;
    });
  }, [searchQuery, filterLatestDraw, latestDrawNumbers]);

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-6 space-y-6" id="ball-movement-guide-container">
      
      {/* Title Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-100 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-1.5 bg-amber-50 text-amber-600 rounded-lg shrink-0">
              <BookOpen size={18} />
            </span>
            <h3 className="font-bold text-slate-800 text-base flex items-center gap-1.5">
              90 Balls Movement Matrix & Guide
            </h3>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Interactive, digitized lookup table for 90-ball counter movement theory. Filter, search, and map partner ball associations.
          </p>
        </div>

        {/* Quick controls */}
        <div className="flex flex-wrap items-center gap-2.5">
          {/* Search box */}
          <div className="relative">
            <Search className="absolute left-2.5 top-2 text-slate-400" size={14} />
            <input
              type="text"
              placeholder="Search ball or partner..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-200 text-xs font-medium rounded-lg text-slate-700 placeholder-slate-400 focus:outline-hidden focus:ring-1 focus:ring-amber-500 w-44"
            />
          </div>

          {/* Latest draw trigger */}
          {latestDrawNumbers.size > 0 && (
            <button
              onClick={() => setFilterLatestDraw(!filterLatestDraw)}
              className={`px-3 py-1.5 border rounded-lg text-xs font-bold transition flex items-center gap-1 cursor-pointer ${
                filterLatestDraw
                  ? "bg-indigo-600 border-indigo-600 text-white"
                  : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"
              }`}
            >
              {filterLatestDraw ? <EyeOff size={13} /> : <Eye size={13} />}
              Latest Draw Balls Only
            </button>
          )}
        </div>
      </div>

      {/* Main split dashboard view */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        
        {/* Left Side: Interactive Selection & Filter Chips */}
        <div className="space-y-4">
          <div className="space-y-1.5">
            <label className="block text-[11px] font-black uppercase text-slate-400 tracking-wider">
              Select Ball to Inspect (1-90)
            </label>
            <div className="flex gap-2">
              <select
                value={selectedNumber || ""}
                onChange={(e) => setSelectedNumber(Number(e.target.value))}
                className="flex-1 px-3 py-2 bg-slate-50 border border-slate-200 text-xs font-bold rounded-lg text-slate-700 focus:outline-hidden focus:ring-1 focus:ring-amber-500"
              >
                {Array.from({ length: 90 }, (_, i) => i + 1).map((num) => (
                  <option key={`select-ball-${num}`} value={num}>
                    Ball {num} {latestDrawNumbers.has(num) ? "• (In Latest Draw)" : ""}
                  </option>
                ))}
              </select>
              
              <div className="flex gap-1 shrink-0">
                <button
                  onClick={() => setSelectedNumber(prev => Math.max(1, (prev || 1) - 1))}
                  disabled={selectedNumber === 1}
                  className="px-2.5 py-1.5 border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-50 text-slate-600 font-bold text-xs cursor-pointer"
                >
                  ← Prev
                </button>
                <button
                  onClick={() => setSelectedNumber(prev => Math.min(90, (prev || 1) + 1))}
                  disabled={selectedNumber === 90}
                  className="px-2.5 py-1.5 border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-50 text-slate-600 font-bold text-xs cursor-pointer"
                >
                  Next →
                </button>
              </div>
            </div>
          </div>

          {/* Quick Stats or Tips about current selection */}
          <div className="p-4 bg-slate-50 border border-slate-200/60 rounded-xl space-y-3">
            <h4 className="text-[11px] font-black uppercase text-slate-500 tracking-wider">
              Quick Reference Information
            </h4>
            <div className="text-xs text-slate-600 leading-relaxed space-y-2">
              <p>
                In 90-ball lotto counter theory, every drawn ball triggers specific counter-movement numbers (Primary and Secondary partners).
              </p>
              {latestDrawDetails && (
                <p className="text-[11px] bg-white border border-slate-200/60 p-2.5 rounded-lg flex items-center gap-1.5 font-medium">
                  <span className="w-1.5 h-1.5 rounded-full bg-indigo-600 shrink-0"></span>
                  <span>
                    The latest draw (<strong>{latestDrawDetails.gameName} Ed.{latestDrawDetails.edition}</strong>) contained {Array.from(latestDrawNumbers).filter((n: any) => n >= 1 && n <= 90).length} numbers.
                  </span>
                </p>
              )}
            </div>
          </div>

          {/* Search query matching list or chips if active */}
          {(searchQuery.trim() !== "" || filterLatestDraw) && (
            <div className="space-y-2 pt-2 border-t border-slate-100">
              <div className="flex items-center justify-between text-[11px] font-black uppercase text-slate-400 tracking-wider">
                <span>Matching Filtered Balls</span>
                <span className="text-amber-600 font-bold">{ballsToRender.length} found</span>
              </div>
              <div className="flex flex-wrap gap-1.5 max-h-[160px] overflow-y-auto p-2 bg-slate-50/50 border border-slate-100 rounded-lg scrollbar-thin">
                {ballsToRender.map((b) => (
                  <button
                    key={`match-chip-${b.number}`}
                    onClick={() => setSelectedNumber(b.number)}
                    className={`px-2.5 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 cursor-pointer border ${
                      b.number === selectedNumber
                        ? "bg-amber-500 text-white border-amber-500 shadow-xs"
                        : "bg-white hover:bg-slate-50 text-slate-700 border-slate-200"
                    }`}
                  >
                    <span>{b.number}</span>
                    {latestDrawNumbers.has(b.number) && (
                      <span className={`w-1.5 h-1.5 rounded-full ${b.number === selectedNumber ? "bg-white" : "bg-indigo-600"} shrink-0`}></span>
                    )}
                  </button>
                ))}
                {ballsToRender.length === 0 && (
                  <div className="text-[10px] text-slate-400 italic p-4 w-full text-center">
                    No matching balls found for your current search criteria.
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Right Side: Detailed Counter Movement Inspector Panel */}
        <div className="bg-slate-900 text-white rounded-2xl p-5 flex flex-col justify-between space-y-4 shadow-md">
          
          {selectedNumber && selectedMovement ? (
            <div className="space-y-4 flex flex-col h-full justify-between">
              
              {/* Selected Title */}
              <div className="space-y-1">
                <span className="text-[10px] font-black tracking-widest text-amber-400 uppercase flex items-center gap-1">
                  <Flame size={12} className="text-amber-400 animate-pulse" /> Counter-Movement Inspector
                </span>
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-full bg-amber-500 border-2 border-amber-300 flex items-center justify-center font-mono font-black text-white text-xl shadow-lg select-none">
                    {selectedNumber}
                  </div>
                  <div>
                    <h4 className="text-sm font-black tracking-tight">Active Trigger Ball</h4>
                    <p className="text-[10px] text-slate-400 font-medium">Selected for association analysis</p>
                  </div>
                </div>
              </div>

              {/* Counter details breakdown */}
              <div className="space-y-3 pt-3 border-t border-slate-800">
                
                {/* Primary movement line */}
                <div className="space-y-2 bg-slate-800/40 p-3 rounded-xl border border-slate-800">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider flex items-center gap-1">
                      <CornerDownRight size={11} className="text-amber-500" /> Primary Counters
                    </span>
                    <span className="text-[9px] font-mono text-slate-400 font-bold bg-slate-800 px-1.5 py-0.5 rounded">
                      Code: {selectedMovement.primaryRaw || "none"}
                    </span>
                  </div>

                  <div className="flex flex-wrap gap-1.5">
                    {selectedMovement.primaryParsed.length > 0 ? (
                      selectedMovement.primaryParsed.map((n) => (
                        <div
                          key={`inspect-p-${n}`}
                          className="px-2 py-1 bg-gradient-to-br from-amber-400 to-amber-600 border border-amber-300 text-white rounded-lg font-mono font-black text-xs shadow-xs"
                        >
                          {n}
                        </div>
                      ))
                    ) : (
                      <span className="text-[10px] text-slate-500 font-medium italic">No primary counters listed</span>
                    )}
                  </div>
                </div>

                {/* Secondary movement line */}
                <div className="space-y-2 bg-slate-800/40 p-3 rounded-xl border border-slate-800">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider flex items-center gap-1">
                      <ArrowRightLeft size={11} className="text-emerald-500" /> Secondary Counters
                    </span>
                    <span className="text-[9px] font-mono text-slate-400 font-bold bg-slate-800 px-1.5 py-0.5 rounded">
                      Code: {selectedMovement.secondaryRaw || "none"}
                    </span>
                  </div>

                  <div className="flex flex-wrap gap-1.5">
                    {selectedMovement.secondaryParsed.length > 0 ? (
                      selectedMovement.secondaryParsed.map((n) => (
                        <div
                          key={`inspect-s-${n}`}
                          className="px-2 py-1 bg-gradient-to-br from-emerald-500 to-emerald-600 border border-emerald-400 text-white rounded-lg font-mono font-black text-xs shadow-xs"
                        >
                          {n}
                        </div>
                      ))
                    ) : (
                      <span className="text-[10px] text-slate-500 font-medium italic">No secondary counters listed</span>
                    )}
                  </div>
                </div>

              </div>

              {/* Explanatory text block */}
              <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 text-[10px] text-slate-400 leading-relaxed space-y-1">
                <span className="font-bold text-slate-300 block">How to play Counter Ball theory:</span>
                <p>
                  Ghana & 90-ball lotto mechanics show that when <strong>Ball {selectedNumber}</strong> is drawn, its historical counterparts are triggered for potential draws. 
                  {selectedMovement.primaryParsed.length > 0 && (
                    <span> Watch for numbers like <strong>{selectedMovement.primaryParsed.join(", ")}</strong> in upcoming editions of the same game.</span>
                  )}
                </p>
              </div>

              {/* Integration status info */}
              {latestDrawDetails && latestDrawNumbers.has(selectedNumber) && (
                <div className="p-2.5 bg-indigo-950/80 border border-indigo-800/50 rounded-xl text-indigo-200 text-[10px] font-medium flex items-center gap-1.5">
                  <Sparkles size={11} className="text-indigo-400 animate-pulse" />
                  <span>This ball triggered in {latestDrawDetails.gameName} (Ed. {latestDrawDetails.edition})!</span>
                </div>
              )}

            </div>
          ) : (
            <div className="flex-1 flex flex-col justify-center items-center text-center p-6 space-y-2">
              <HelpCircle size={28} className="text-slate-600" />
              <p className="text-xs font-bold text-slate-400">No Ball Selected</p>
              <p className="text-[10px] text-slate-500">Please select a ball to inspect its Counter-Movement counterpart codes.</p>
            </div>
          )}

        </div>

      </div>

    </div>
  );
}
