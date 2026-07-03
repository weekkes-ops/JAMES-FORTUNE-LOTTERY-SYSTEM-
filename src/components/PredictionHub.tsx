import React, { useState, useEffect } from "react";
import { LottoResult } from "../types";
import { getPredictionForGame, PredictionData, calculateLocalStatisticalPrediction, PredictionStrategy } from "../utils/predictionEngine";
import { Brain, Sparkles, Cpu, RotateCw, RefreshCw, BarChart4, TrendingUp, Info, Hash, PlaySquare } from "lucide-react";

interface PredictionHubProps {
  results: LottoResult[];
  latestInsertedDraw?: LottoResult | null;
  onClearLatestDraw?: () => void;
}

export default function PredictionHub({ results, latestInsertedDraw, onClearLatestDraw }: PredictionHubProps) {
  // Extract unique games dynamically from results list
  const games = Array.from(new Set(results.map((r) => r.gameName))).sort();
  const [selectedGame, setSelectedGame] = useState<string>(games[0] || "MAD MAX");
  const [strategy, setStrategy] = useState<PredictionStrategy>("balanced");
  const [targetEventName, setTargetEventName] = useState<string>("");
  const [targetDate, setTargetDate] = useState<string>("");
  const [targetTime, setTargetTime] = useState<string>("18:30");
  const [prediction, setPrediction] = useState<PredictionData | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Load prediction when game selection changes or results list changes
  const fetchPrediction = async (
    game: string, 
    currentStrategy: PredictionStrategy = strategy,
    name = targetEventName,
    date = targetDate,
    time = targetTime
  ) => {
    if (results.length === 0) return;
    setLoading(true);
    setError(null);
    try {
      const pred = await getPredictionForGame(game, results, currentStrategy, date, time, name);
      setPrediction(pred);
    } catch (err: any) {
      setError("Unable to compute prediction. Falling back to simple statistical calculations.");
      const fallback = calculateLocalStatisticalPrediction(game, results, currentStrategy, date, time, name);
      setPrediction(fallback);
    } finally {
      setLoading(false);
    }
  };

  // Auto-estimate next target date and standard draw times when selectedGame changes
  useEffect(() => {
    if (selectedGame) {
      setTargetEventName(selectedGame);
      
      const gameDraws = results.filter(
        (r) => r.gameName.trim().toLowerCase() === selectedGame.trim().toLowerCase()
      );
      if (gameDraws.length > 0) {
        const sorted = [...gameDraws].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
        const latestDate = new Date(sorted[0].date);
        if (!isNaN(latestDate.getTime())) {
          // Default next game prediction to 1 day after the latest draw
          latestDate.setDate(latestDate.getDate() + 1);
          setTargetDate(latestDate.toISOString().split("T")[0]);
        } else {
          setTargetDate(new Date().toISOString().split("T")[0]);
        }
        setTargetTime(sorted[0].time || "18:30");
      } else {
        setTargetDate(new Date().toISOString().split("T")[0]);
        setTargetTime("18:30");
      }
    }
  }, [selectedGame]);

  useEffect(() => {
    if (selectedGame) {
      fetchPrediction(selectedGame, strategy, targetEventName, targetDate, targetTime);
    }
  }, [selectedGame, results, strategy, targetEventName, targetDate, targetTime]);

  // Handle detection of a newly inserted draw to auto-focus and show predictions
  useEffect(() => {
    if (latestInsertedDraw) {
      setSelectedGame(latestInsertedDraw.gameName);
      fetchPrediction(latestInsertedDraw.gameName, strategy, latestInsertedDraw.gameName, targetDate, targetTime);

      // Smoothly scroll the prediction analytics hub into view so the user can see the 5 predicted numbers instantly
      setTimeout(() => {
        const element = document.getElementById("prediction-analytics-hub");
        if (element) {
          element.scrollIntoView({ behavior: "smooth", block: "center" });
        }
      }, 300);
    }
  }, [latestInsertedDraw]);

  if (results.length === 0) {
    return (
      <div className="bg-white rounded-xl shadow-xs border border-slate-100 p-6 text-center text-slate-400 italic text-sm">
        Add lottery drawing entries to the ledger to unlock predictive analytics.
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl shadow-xs border border-slate-100 p-6 space-y-6" id="prediction-analytics-hub">
      
      {/* Header Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-100 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-1.5 bg-indigo-50 text-indigo-600 rounded-lg shrink-0">
              <Brain size={18} />
            </span>
            <h3 className="font-bold text-slate-800 text-base flex items-center gap-1.5">
              🔮 Next Game Predictive Analytics
            </h3>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Statistical number matrix and Gemini AI model forecasting for subsequent lottery draw events.
          </p>
        </div>

        {/* Game Selector & Refresh Button */}
        <div className="flex items-center gap-2 self-start md:self-auto">
          <select
            value={selectedGame}
            onChange={(e) => setSelectedGame(e.target.value)}
            className="px-3 py-1.5 bg-slate-50 border border-slate-200 text-slate-700 text-xs font-semibold rounded-lg focus:outline-hidden focus:ring-1 focus:ring-indigo-500"
            id="predict-game-select"
          >
            {games.map((game) => (
              <option key={game} value={game}>
                {game}
              </option>
            ))}
          </select>
          <button
            onClick={() => fetchPrediction(selectedGame, strategy)}
            disabled={loading}
            className="p-2 border border-slate-200 text-slate-500 hover:text-indigo-600 hover:bg-slate-50 rounded-lg transition disabled:opacity-50 cursor-pointer flex items-center justify-center"
            title="Recalculate predictions"
            id="predict-refresh-btn"
          >
            <RotateCw size={14} className={loading ? "animate-spin text-indigo-600" : ""} />
          </button>
        </div>
      </div>

      {/* Target Draw Schedule Settings */}
      <div className="bg-slate-50/50 border border-slate-200/60 rounded-xl p-4 space-y-3">
        <div className="flex items-center gap-1.5">
          <span className="p-1 bg-indigo-50 text-indigo-600 rounded-md shrink-0">
            <Sparkles size={12} className="text-indigo-600 animate-pulse" />
          </span>
          <span className="text-[11px] font-black uppercase text-slate-500 tracking-wider">
            Target Event / Draw Schedule Configuration
          </span>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Input 1: Event/Draw Name */}
          <div className="space-y-1">
            <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-tight">
              Event / Draw Name
            </label>
            <input
              type="text"
              value={targetEventName}
              onChange={(e) => setTargetEventName(e.target.value)}
              placeholder="e.g. MAD MAX SPECIAL"
              className="w-full px-3 py-1.5 bg-white border border-slate-200 text-xs font-semibold rounded-lg focus:outline-hidden focus:ring-1 focus:ring-indigo-500 text-slate-700"
              id="predict-target-name-input"
            />
          </div>

          {/* Input 2: Target Date */}
          <div className="space-y-1">
            <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-tight">
              Target Draw Date
            </label>
            <input
              type="date"
              value={targetDate}
              onChange={(e) => setTargetDate(e.target.value)}
              className="w-full px-3 py-1.5 bg-white border border-slate-200 text-xs font-semibold rounded-lg focus:outline-hidden focus:ring-1 focus:ring-indigo-500 text-slate-700"
              id="predict-target-date-input"
            />
          </div>

          {/* Input 3: Target Time */}
          <div className="space-y-1">
            <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-tight">
              Target Draw Time
            </label>
            <input
              type="time"
              value={targetTime}
              onChange={(e) => setTargetTime(e.target.value)}
              className="w-full px-3 py-1.5 bg-white border border-slate-200 text-xs font-semibold rounded-lg focus:outline-hidden focus:ring-1 focus:ring-indigo-500 text-slate-700"
              id="predict-target-time-input"
            />
          </div>
        </div>
        <p className="text-[9px] text-slate-400">
          * Modifying any setting above dynamically adjusts historical trend analysis and updates prediction reasoning details below.
        </p>
      </div>

      {/* Prediction Strategy Selector Grid */}
      <div className="space-y-2">
        <label className="text-[11px] font-black uppercase text-slate-400 tracking-wider">
          Prediction Mode & Target Strategy
        </label>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {/* Strategy 1: Balanced */}
          <button
            onClick={() => setStrategy("balanced")}
            className={`text-left p-3.5 rounded-xl border transition cursor-pointer flex flex-col justify-between ${
              strategy === "balanced"
                ? "bg-indigo-50/55 border-indigo-200 ring-2 ring-indigo-500/10"
                : "bg-white border-slate-200 hover:border-slate-300 hover:bg-slate-50/50"
            }`}
            id="strategy-balanced-btn"
          >
            <div className="flex items-center gap-1.5">
              <span className={`p-1 rounded-md ${strategy === "balanced" ? "bg-indigo-100 text-indigo-700" : "bg-slate-100 text-slate-500"}`}>
                <Hash size={12} />
              </span>
              <span className="text-xs font-extrabold text-slate-800">Balanced Statistical</span>
            </div>
            <p className="text-[10px] text-slate-500 mt-2 leading-relaxed">
              Blends Hot (frequent) and Cold (overdue) numbers representing classic probability distributions.
            </p>
          </button>

          {/* Strategy 2: Pure Evens */}
          <button
            onClick={() => setStrategy("evens")}
            className={`text-left p-3.5 rounded-xl border transition cursor-pointer flex flex-col justify-between ${
              strategy === "evens"
                ? "bg-indigo-50/55 border-indigo-200 ring-2 ring-indigo-500/10"
                : "bg-white border-slate-200 hover:border-slate-300 hover:bg-slate-50/50"
            }`}
            id="strategy-evens-btn"
          >
            <div className="flex items-center gap-1.5">
              <span className={`p-1 rounded-md ${strategy === "evens" ? "bg-indigo-100 text-indigo-700" : "bg-slate-100 text-slate-500"}`}>
                <PlaySquare size={12} />
              </span>
              <span className="text-xs font-extrabold text-slate-800">Pure Evens Priority</span>
            </div>
            <p className="text-[10px] text-slate-500 mt-2 leading-relaxed">
              Filters prediction models strictly to Even-numbered outcomes based on historical recurring frequencies.
            </p>
          </button>

          {/* Strategy 3: Counter-Movement Evens ("According to Evens, whichever is next") */}
          <button
            onClick={() => setStrategy("evens-next")}
            className={`text-left p-3.5 rounded-xl border transition cursor-pointer flex flex-col justify-between ${
              strategy === "evens-next"
                ? "bg-gradient-to-br from-indigo-50/80 to-indigo-50/40 border-indigo-300 ring-2 ring-indigo-500/10"
                : "bg-white border-slate-200 hover:border-slate-300 hover:bg-slate-50/50"
            }`}
            id="strategy-evens-next-btn"
          >
            <div className="flex items-center gap-1.5">
              <span className="p-1 rounded-md bg-indigo-600 text-white animate-pulse">
                <Sparkles size={12} />
              </span>
              <span className="text-xs font-extrabold text-slate-800">Evens-Next (Counter Movement)</span>
            </div>
            <p className="text-[10px] text-slate-500 mt-2 leading-relaxed">
              <strong>"According to evens, whichever is next"</strong> — extracts active even counterparts triggered by the last drawn balls using the 90-ball movement sheet.
            </p>
          </button>
        </div>
      </div>

      {/* Newly Inserted Congratulatory Prediction Modal Banner */}
      {latestInsertedDraw && (
        <div 
          className="bg-indigo-50 border border-indigo-100 rounded-xl p-4 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 animate-fade-in" 
          id="new-draw-alert-banner"
        >
          <div className="space-y-1">
            <div className="flex items-center gap-1.5">
              <Sparkles size={16} className="text-amber-500 fill-amber-500 animate-pulse" />
              <h4 className="font-bold text-indigo-900 text-sm">
                New Draw Success: Predictor Recalculated!
              </h4>
            </div>
            <p className="text-xs text-indigo-700 leading-relaxed">
              Successfully registered drawing results for <strong>{latestInsertedDraw.gameName} (Ed. {latestInsertedDraw.edition})</strong>. 
              Below is the newly computed forecasting model for the upcoming game!
            </p>
          </div>
          <button
            onClick={onClearLatestDraw}
            className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs rounded-lg shadow-xs transition cursor-pointer"
            id="new-draw-alert-dismiss"
          >
            Got it, thanks!
          </button>
        </div>
      )}

      {/* Main Grid Content */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
        
        {/* Left Side: Ball displays (7 cols) */}
        <div className="lg:col-span-7 flex flex-col justify-between space-y-6">
          
          {loading ? (
            <div className="flex-1 flex flex-col items-center justify-center py-12 space-y-3 bg-slate-50 rounded-xl border border-dashed border-slate-200">
              <div className="w-10 h-10 rounded-full border-2 border-indigo-600 border-t-transparent animate-spin"></div>
              <p className="text-xs text-slate-500 font-bold tracking-tight animate-pulse">Running Monte Carlo simulation & Gemini forecasting...</p>
            </div>
          ) : prediction ? (
            <div className="space-y-6 flex-1 flex flex-col justify-between">
              
              {/* Prediction Target Tagline */}
              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2 border-b border-slate-100 pb-3">
                <div className="flex flex-col gap-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs bg-indigo-600 text-white px-2.5 py-1 rounded-lg font-black tracking-tight uppercase">
                      {targetEventName || selectedGame}
                    </span>
                    <span className="text-xs text-slate-400 font-semibold">
                      Target Edition: <strong className="text-slate-800 font-bold">Ed. {prediction.nextEdition}</strong>
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-500 font-semibold flex items-center gap-2 flex-wrap mt-0.5">
                    <span className="text-slate-400">Target Draw Schedule:</span>
                    <span className="bg-slate-100 text-slate-700 px-2 py-0.5 rounded-md text-[10px]">
                      📅 {targetDate || "Next Draw"}
                    </span>
                    <span className="bg-slate-100 text-slate-700 px-2 py-0.5 rounded-md text-[10px]">
                      ⏰ {targetTime || "18:30"}
                    </span>
                  </div>
                </div>

                {/* AI / Stat Indicator */}
                <div className="flex items-center gap-1.5 text-[11px] font-bold">
                  {prediction.isAiPowered ? (
                    <span className="inline-flex items-center gap-1 bg-amber-50 text-amber-800 border border-amber-100 px-2 py-0.5 rounded-md">
                      <Cpu size={11} className="text-amber-600 animate-pulse" /> Gemini AI Smart Predictor
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 bg-slate-100 text-slate-600 border border-slate-200 px-2 py-0.5 rounded-md">
                      <BarChart4 size={11} /> Statistical Model Fallback
                    </span>
                  )}
                </div>
              </div>

              {/* Number Balls Display Card */}
              <div className="bg-slate-50 border border-slate-100 rounded-2xl p-6 space-y-5 flex-1 flex flex-col justify-center">
                
                {/* 1. Winning Numbers Display */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-black text-slate-600 uppercase tracking-wider">
                      Predicted Winning (5 Numbers)
                    </span>
                    <span className="text-[10px] text-slate-400 font-medium">Standard Draw Outcome</span>
                  </div>
                  <div className="flex flex-wrap gap-2.5">
                    {prediction.predictedWinningNumbers.map((num) => (
                      <div
                        key={`pred-win-${num}`}
                        className="w-12 h-12 rounded-full bg-gradient-to-br from-amber-400 to-amber-600 text-white flex items-center justify-center font-mono font-black text-lg shadow-md hover:scale-115 transition duration-200 border-2 border-amber-300/40 relative group cursor-help select-none"
                        title="Predicted main winner"
                      >
                        {num}
                        <span className="absolute -top-1 -right-1 w-3 h-3 bg-indigo-500 rounded-full scale-0 group-hover:scale-100 transition duration-150"></span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* 2. Extra Numbers Display */}
                <div className="space-y-2 pt-1 border-t border-slate-200/50">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-black text-emerald-600 uppercase tracking-wider">
                      Predicted Extra (2 Numbers)
                    </span>
                    <span className="text-[10px] text-slate-400 font-medium">Bonus Thresholds</span>
                  </div>
                  <div className="flex flex-wrap gap-2.5">
                    {prediction.predictedExtraNumbers.map((num) => (
                      <div
                        key={`pred-extra-${num}`}
                        className="w-10 h-10 rounded-full bg-gradient-to-br from-emerald-500 to-teal-600 text-white flex items-center justify-center font-mono font-black text-md shadow-md hover:scale-115 transition duration-200 border-2 border-emerald-300/30 select-none"
                      >
                        {num}
                      </div>
                    ))}
                  </div>
                </div>

                {/* 3. Machine Numbers Display */}
                <div className="space-y-2 pt-1 border-t border-slate-200/50">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-black text-slate-500 uppercase tracking-wider">
                      Predicted Machine (5 Numbers)
                    </span>
                    <span className="text-[10px] text-slate-400 font-medium">Backup Verification</span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {prediction.predictedMachineNumbers.map((num) => (
                      <div
                        key={`pred-mach-${num}`}
                        className="w-9 h-9 rounded-full bg-gradient-to-br from-slate-600 to-slate-800 text-white flex items-center justify-center font-mono font-black text-xs shadow-xs hover:scale-115 transition duration-200 border-2 border-slate-500/20 select-none"
                      >
                        {num}
                      </div>
                    ))}
                  </div>
                </div>

              </div>

            </div>
          ) : (
            <div className="flex-1 flex items-center justify-center p-12 text-slate-400 italic text-xs">
              Waiting for prediction calculation parameters...
            </div>
          )}

        </div>

        {/* Right Side: Reasoning, statistics and metadata (5 cols) */}
        <div className="lg:col-span-5 bg-indigo-950 text-white rounded-2xl p-6 flex flex-col justify-between space-y-4 shadow-lg relative overflow-hidden">
          
          {/* Subtle background glow decorator */}
          <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/10 rounded-full blur-2xl"></div>
          
          {loading ? (
            <div className="flex-1 flex flex-col justify-center items-center py-12 space-y-3">
              <div className="w-8 h-8 rounded-full border-2 border-white/20 border-t-white animate-spin"></div>
              <p className="text-xs text-indigo-200/70 font-bold">Parsing historical draw behaviors...</p>
            </div>
          ) : prediction ? (
            <div className="space-y-4 flex-1 flex flex-col justify-between">
              
              <div className="space-y-1.5">
                <div className="flex items-center gap-1.5 text-indigo-300 font-extrabold text-xs uppercase tracking-wider">
                  <TrendingUp size={14} /> Analytical Reasoning & Rationale
                </div>
                <h4 className="text-md font-bold text-white tracking-tight">
                  Probability Forecast Breakdown
                </h4>
              </div>

              {/* Reasoning Body */}
              <div className="bg-white/5 border border-white/10 rounded-xl p-4 flex-1 overflow-y-auto max-h-[220px] scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent">
                <p className="text-xs text-indigo-100/90 font-mono leading-relaxed whitespace-pre-wrap">
                  {prediction.reasoning}
                </p>
              </div>

              {/* Informative footer */}
              <div className="flex items-start gap-2 bg-indigo-900/40 p-3 rounded-xl border border-indigo-800/50">
                <Info size={14} className="text-indigo-400 shrink-0 mt-0.5" />
                <p className="text-[10px] text-indigo-200/80 leading-relaxed">
                  Lottery outcomes represent independent random events. This predictive module serves purely as a mathematical frequency visualizer and statistical analysis engine. 18+ Only. Play responsibly.
                </p>
              </div>

            </div>
          ) : (
            <div className="flex-1 flex items-center justify-center text-indigo-200/50 italic text-xs">
              Analytical matrix calculations pending.
            </div>
          )}

        </div>

      </div>

    </div>
  );
}
