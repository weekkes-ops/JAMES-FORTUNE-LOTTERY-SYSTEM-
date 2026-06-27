import React, { useState, useMemo } from "react";
import { LottoResult } from "../types";
import { TrendingUp, BarChart3, HelpCircle, Activity } from "lucide-react";

interface StatsDashboardProps {
  results: LottoResult[];
}

type TabType = "winning" | "machine" | "all";

export default function StatsDashboard({ results }: StatsDashboardProps) {
  const [activeTab, setActiveTab] = useState<TabType>("winning");

  // Calculate stats based on active category
  const stats = useMemo(() => {
    const frequency: { [key: number]: number } = {};
    let oddCount = 0;
    let evenCount = 0;
    let totalBallsCount = 0;
    let highCount = 0; // 46-90
    let lowCount = 0;  // 1-45

    results.forEach((r) => {
      let balls: number[] = [];
      if (activeTab === "winning") {
        balls = [...r.winningNumbers, ...r.extraNumbers];
      } else if (activeTab === "machine") {
        balls = r.machineNumbers;
      } else {
        balls = [...r.winningNumbers, ...r.extraNumbers, ...r.machineNumbers];
      }

      balls.forEach((num) => {
        if (num <= 0) return; // skip placeholders
        frequency[num] = (frequency[num] || 0) + 1;
        totalBallsCount++;
        
        // Odd/Even parity
        if (num % 2 === 0) evenCount++;
        else oddCount++;

        // High/Low distribution (Standard 90-ball lotto threshold is 45)
        if (num > 45) highCount++;
        else lowCount++;
      });
    });

    // Sort to get hot and cold numbers
    const sortedFrequencies = Object.entries(frequency)
      .map(([num, count]) => ({ number: parseInt(num, 10), count }))
      .sort((a, b) => b.count - a.count);

    const hotNumbers = sortedFrequencies.slice(0, 8);
    const coldNumbers = sortedFrequencies.slice(-8).reverse();

    // Group frequencies into ranges for chart (1-15, 16-30, 31-45, 46-60, 61-75, 76-90)
    const ranges = [
      { label: "1-15", count: 0 },
      { label: "16-30", count: 0 },
      { label: "31-45", count: 0 },
      { label: "46-60", count: 0 },
      { label: "61-75", count: 0 },
      { label: "76-90", count: 0 }
    ];

    Object.entries(frequency).forEach(([numStr, count]) => {
      const num = parseInt(numStr, 10);
      if (num >= 1 && num <= 15) ranges[0].count += count;
      else if (num >= 16 && num <= 30) ranges[1].count += count;
      else if (num >= 31 && num <= 45) ranges[2].count += count;
      else if (num >= 46 && num <= 60) ranges[3].count += count;
      else if (num >= 61 && num <= 75) ranges[4].count += count;
      else if (num >= 76 && num <= 90) ranges[5].count += count;
    });

    // Find maximum count for scaling ranges bar chart
    const maxRangeCount = Math.max(...ranges.map(r => r.count), 1);

    const oddPercentage = totalBallsCount ? Math.round((oddCount / totalBallsCount) * 100) : 50;
    const evenPercentage = totalBallsCount ? Math.round((evenCount / totalBallsCount) * 100) : 50;
    const highPercentage = totalBallsCount ? Math.round((highCount / totalBallsCount) * 100) : 50;
    const lowPercentage = totalBallsCount ? Math.round((lowCount / totalBallsCount) * 100) : 50;

    return {
      totalBallsCount,
      hotNumbers,
      coldNumbers,
      oddPercentage,
      evenPercentage,
      highPercentage,
      lowPercentage,
      ranges,
      maxRangeCount
    };
  }, [results, activeTab]);

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-5" id="stats-dashboard-container">
      {/* Header and Category Tabs */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-4 mb-5">
        <div>
          <h2 className="text-lg font-semibold text-slate-800 flex items-center gap-1.5">
            <Activity size={18} className="text-indigo-600" /> Draw Statistics & Analytics
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">Real-time breakdown of hot balls, frequency ranges, and parity distributions.</p>
        </div>

        {/* Tab Selection */}
        <div className="inline-flex p-1 bg-slate-100 rounded-lg self-start">
          <button
            onClick={() => setActiveTab("winning")}
            className={`px-3 py-1.5 text-xs font-semibold rounded-md transition cursor-pointer ${
              activeTab === "winning" ? "bg-white text-indigo-600 shadow-xs" : "text-slate-500 hover:text-slate-800"
            }`}
          >
            Winning + Extra
          </button>
          <button
            onClick={() => setActiveTab("machine")}
            className={`px-3 py-1.5 text-xs font-semibold rounded-md transition cursor-pointer ${
              activeTab === "machine" ? "bg-white text-indigo-600 shadow-xs" : "text-slate-500 hover:text-slate-800"
            }`}
          >
            Machine Draws
          </button>
          <button
            onClick={() => setActiveTab("all")}
            className={`px-3 py-1.5 text-xs font-semibold rounded-md transition cursor-pointer ${
              activeTab === "all" ? "bg-white text-indigo-600 shadow-xs" : "text-slate-500 hover:text-slate-800"
            }`}
          >
            All Combined
          </button>
        </div>
      </div>

      {/* Grid Content */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Card 1: Hot / Cold Numbers */}
        <div className="space-y-4">
          {/* Hot Numbers */}
          <div className="bg-slate-50 rounded-xl p-4 border border-slate-100">
            <h3 className="text-xs font-bold text-orange-600 uppercase tracking-wider flex items-center gap-1 mb-3">
              <TrendingUp size={14} /> Hot Numbers (Most Frequent)
            </h3>
            {stats.hotNumbers.length === 0 ? (
              <p className="text-xs text-slate-400 italic">No draws recorded yet</p>
            ) : (
              <div className="flex flex-wrap gap-2.5">
                {stats.hotNumbers.map((item, idx) => (
                  <div key={idx} className="flex flex-col items-center">
                    <span className="w-8 h-8 rounded-full bg-orange-500 text-white font-mono text-xs font-bold flex items-center justify-center border border-orange-600 shadow-xs mb-1">
                      {item.number}
                    </span>
                    <span className="text-[10px] text-slate-400 font-bold">{item.count}x</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Cold Numbers */}
          <div className="bg-slate-50 rounded-xl p-4 border border-slate-100">
            <h3 className="text-xs font-bold text-sky-600 uppercase tracking-wider flex items-center gap-1 mb-3">
              <HelpCircle size={14} /> Cold Numbers (Least Frequent)
            </h3>
            {stats.coldNumbers.length === 0 ? (
              <p className="text-xs text-slate-400 italic">No draws recorded yet</p>
            ) : (
              <div className="flex flex-wrap gap-2.5">
                {stats.coldNumbers.map((item, idx) => (
                  <div key={idx} className="flex flex-col items-center">
                    <span className="w-8 h-8 rounded-full bg-slate-200 text-slate-700 font-mono text-xs font-bold flex items-center justify-center border border-slate-300 shadow-xs mb-1">
                      {item.number}
                    </span>
                    <span className="text-[10px] text-slate-400 font-bold">{item.count}x</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Card 2: Frequency Range Distribution (Visual Chart) */}
        <div className="bg-slate-50 rounded-xl p-4 border border-slate-100 flex flex-col justify-between">
          <div>
            <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1 mb-4">
              <BarChart3 size={14} /> Range Frequency Distribution
            </h3>
            <div className="space-y-3">
              {stats.ranges.map((range, idx) => {
                const pct = Math.round((range.count / stats.maxRangeCount) * 100) || 0;
                return (
                  <div key={idx} className="space-y-1">
                    <div className="flex items-center justify-between text-xs font-medium text-slate-600">
                      <span>Balls {range.label}</span>
                      <span className="font-mono text-slate-500">{range.count} occurrences</span>
                    </div>
                    <div className="w-full h-2.5 bg-slate-200 rounded-full overflow-hidden">
                      <div 
                        style={{ width: `${pct}%` }} 
                        className="h-full bg-gradient-to-r from-indigo-500 to-indigo-600 rounded-full transition-all duration-500"
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
          <p className="text-[10px] text-slate-400 italic mt-3 pt-2 border-t border-slate-200">
            Shows how draw numbers partition across lower and higher tiers (1 to 90).
          </p>
        </div>

        {/* Card 3: Parity and Clustering Ratio */}
        <div className="bg-slate-50 rounded-xl p-4 border border-slate-100 flex flex-col justify-between">
          <div className="space-y-5">
            {/* Parity (Odd/Even) */}
            <div>
              <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-2.5">
                Odd vs Even Parity
              </h3>
              <div className="flex items-center gap-3">
                <div className="flex-1">
                  <div className="flex justify-between text-xs text-slate-600 mb-1">
                    <span className="font-semibold text-indigo-600">Odd ({stats.oddPercentage}%)</span>
                    <span className="font-semibold text-emerald-600">Even ({stats.evenPercentage}%)</span>
                  </div>
                  <div className="w-full h-4 bg-emerald-500 rounded-lg overflow-hidden flex">
                    <div 
                      style={{ width: `${stats.oddPercentage}%` }} 
                      className="bg-indigo-500 h-full border-r border-white/20 transition-all duration-500"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Clustering (High/Low) */}
            <div>
              <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-2.5">
                High vs Low Distribution
              </h3>
              <div className="flex items-center gap-3">
                <div className="flex-1">
                  <div className="flex justify-between text-xs text-slate-600 mb-1">
                    <span className="font-semibold text-indigo-700">Low 1-45 ({stats.lowPercentage}%)</span>
                    <span className="font-semibold text-violet-500">High 46-90 ({stats.highPercentage}%)</span>
                  </div>
                  <div className="w-full h-4 bg-violet-500 rounded-lg overflow-hidden flex">
                    <div 
                      style={{ width: `${stats.lowPercentage}%` }} 
                      className="bg-indigo-600 h-full border-r border-white/20 transition-all duration-500"
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-4 p-3 bg-white rounded-lg border border-indigo-50/50 flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-indigo-50 flex items-center justify-center text-indigo-600 font-bold font-mono text-sm shrink-0">
              {results.length}
            </div>
            <div>
              <span className="block text-xs font-bold text-slate-700">Total Recorded Draws</span>
              <span className="text-[10px] text-slate-400">Expanding dataset feeds finer insights.</span>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
