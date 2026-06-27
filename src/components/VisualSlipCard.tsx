import React from "react";
import { LottoResult } from "../types";
import { formatLottoDate } from "../utils/dateUtils";

interface VisualSlipCardProps {
  key?: string;
  result: LottoResult;
  isSelected: boolean;
  onSelect: () => void;
}

export default function VisualSlipCard({ result, isSelected, onSelect }: VisualSlipCardProps) {
  // Generate stylized backgrounds matching the 10 uploaded images
  const getStyleTheme = (gameName: string) => {
    switch (gameName) {
      case "MAD MAX":
        return {
          bg: "bg-gradient-to-b from-orange-400 via-orange-500 to-amber-600",
          accentColor: "text-amber-100",
          ballBg: "bg-slate-800 text-white border-slate-700",
          extraBallBg: "bg-amber-800 text-amber-100 border-amber-900",
          machineBallBg: "bg-slate-700 text-slate-100 border-slate-800",
          sub: "FRIDAY • 2PM • Edition 412"
        };
      case "MANO":
        return {
          bg: "bg-gradient-to-b from-teal-400 via-emerald-600 to-emerald-800",
          accentColor: "text-emerald-100",
          ballBg: "bg-yellow-400 text-slate-900 border-yellow-500",
          extraBallBg: "bg-green-400 text-emerald-950 border-green-500",
          machineBallBg: "bg-lime-400 text-emerald-950 border-lime-500",
          sub: "FRIDAY • 11AM • Edition 412"
        };
      case "NATIONAL":
        return {
          bg: "bg-gradient-to-b from-indigo-900 via-purple-900 to-slate-900",
          accentColor: "text-purple-200",
          ballBg: "bg-blue-600 text-white border-blue-500",
          extraBallBg: "bg-violet-500 text-white border-violet-400",
          machineBallBg: "bg-teal-500 text-white border-teal-400",
          sub: "TUESDAY • 8PM • Edition 410"
        };
      case "BOMBALI SPECIAL":
        return {
          bg: "bg-gradient-to-b from-cyan-500 via-blue-600 to-blue-800",
          accentColor: "text-cyan-100",
          ballBg: "bg-blue-900 text-white border-blue-950",
          extraBallBg: "bg-emerald-500 text-white border-emerald-600",
          machineBallBg: "bg-sky-900 text-sky-100 border-sky-950",
          sub: "TUESDAY • 2PM • Edition 410"
        };
      case "Peninsular":
        return {
          bg: "bg-gradient-to-b from-pink-500 via-rose-600 to-purple-800",
          accentColor: "text-pink-100",
          ballBg: "bg-purple-900 text-white border-purple-950",
          extraBallBg: "bg-fuchsia-500 text-white border-fuchsia-600",
          machineBallBg: "bg-rose-900 text-rose-100 border-rose-950",
          sub: "TUESDAY • 4PM • Edition 410"
        };
      case "DAILY SPECIAL":
        return {
          bg: "bg-gradient-to-b from-blue-700 via-indigo-800 to-slate-900",
          accentColor: "text-blue-100",
          ballBg: "bg-white text-slate-800 border-slate-200",
          extraBallBg: "bg-yellow-400 text-slate-900 border-yellow-500",
          machineBallBg: "bg-slate-300 text-slate-800 border-slate-400",
          sub: "TUESDAY • 6PM • Edition 2277"
        };
      case "COTTON TREE":
        return {
          bg: "bg-gradient-to-b from-green-500 via-emerald-700 to-emerald-900",
          accentColor: "text-green-100",
          ballBg: "bg-slate-900 text-white border-slate-850",
          extraBallBg: "bg-emerald-400 text-emerald-950 border-emerald-500",
          machineBallBg: "bg-slate-700 text-slate-100 border-slate-850",
          sub: "TUESDAY • 11AM • Edition 410"
        };
      case "Tonkolili SPECIAL":
        return {
          bg: "bg-gradient-to-b from-amber-500 via-yellow-600 to-orange-800",
          accentColor: "text-yellow-100",
          ballBg: "bg-rose-500 text-white border-rose-600",
          extraBallBg: "bg-orange-500 text-white border-orange-600",
          machineBallBg: "bg-red-500 text-white border-red-600",
          sub: "TUESDAY • 9AM • Edition 245"
        };
      case "KOINADUGU SPECIAL":
        return {
          bg: "bg-gradient-to-b from-yellow-400 via-amber-500 to-orange-600",
          accentColor: "text-amber-900",
          ballBg: "bg-white text-slate-800 border-slate-200",
          extraBallBg: "bg-slate-800 text-white border-slate-900",
          machineBallBg: "bg-slate-100 text-slate-700 border-slate-200",
          sub: "WEDNESDAY • 9AM • Edition 244"
        };
      case "KANGARI":
        return {
          bg: "bg-gradient-to-b from-sky-400 via-blue-500 to-indigo-700",
          accentColor: "text-sky-100",
          ballBg: "bg-indigo-900 text-white border-indigo-950",
          extraBallBg: "bg-violet-600 text-white border-violet-700",
          machineBallBg: "bg-sky-900 text-sky-100 border-sky-950",
          sub: "WEDNESDAY • 11AM • Edition 412"
        };
      default:
        return {
          bg: "bg-gradient-to-b from-slate-600 via-slate-700 to-slate-800",
          accentColor: "text-slate-100",
          ballBg: "bg-slate-900 text-white border-slate-800",
          extraBallBg: "bg-emerald-600 text-white border-emerald-700",
          machineBallBg: "bg-slate-200 text-slate-700 border-slate-300",
          sub: `${formatLottoDate(result.date)} • ${result.time}`
        };
    }
  };

  const theme = getStyleTheme(result.gameName);

  return (
    <div 
      onClick={onSelect}
      className={`relative w-64 h-80 rounded-2xl overflow-hidden shadow-md flex flex-col justify-between p-4 cursor-pointer select-none transition-all duration-300 transform border-3 ${
        isSelected 
          ? "scale-102 border-indigo-500 ring-4 ring-indigo-500/20 shadow-xl" 
          : "hover:scale-101 border-transparent hover:shadow-lg"
      } ${theme.bg}`}
      id={`visual-slip-card-${result.id}`}
    >
      {/* Upper Brand Info */}
      <div className="text-center space-y-1">
        <span className="text-[9px] font-extrabold uppercase tracking-widest text-white bg-white/20 px-2.5 py-0.5 rounded-full backdrop-blur-xs">
          JAMES FORTUNE LOTTERY
        </span>
        <h3 className="text-xl font-black text-white tracking-tighter uppercase drop-shadow-md mt-1">
          {result.gameName}
        </h3>
        <p className={`text-[10px] font-bold ${theme.accentColor}`}>
          {theme.sub}
        </p>
      </div>

      {/* Middle Number Balls area */}
      <div className="space-y-3 py-2 bg-black/10 rounded-xl px-2 backdrop-blur-3xs">
        {/* Winning */}
        <div>
          <span className="block text-[8px] font-black text-white uppercase tracking-widest text-center opacity-80 mb-1">
            WINNING
          </span>
          <div className="flex justify-center gap-1">
            {result.winningNumbers.map((num, i) => (
              <span 
                key={i} 
                className={`w-6 h-6 rounded-full font-mono text-[10px] font-black flex items-center justify-center border shadow-xs ${theme.ballBg}`}
              >
                {num}
              </span>
            ))}
          </div>
        </div>

        {/* Extra if present */}
        {result.extraNumbers.length > 0 && result.extraNumbers.some(n => n > 0) && (
          <div>
            <span className="block text-[8px] font-black text-white uppercase tracking-widest text-center opacity-80 mb-1">
              EXTRA
            </span>
            <div className="flex justify-center gap-1.5">
              {result.extraNumbers.map((num, i) => (
                <span 
                  key={i} 
                  className={`w-6 h-6 rounded-full font-mono text-[10px] font-black flex items-center justify-center border shadow-xs ${theme.extraBallBg}`}
                >
                  {num}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Machine if present */}
        {result.machineNumbers.length > 0 && result.machineNumbers.some(n => n > 0) && (
          <div>
            <span className="block text-[8px] font-black text-white uppercase tracking-widest text-center opacity-80 mb-1">
              MACHINE
            </span>
            <div className="flex justify-center gap-1">
              {result.machineNumbers.map((num, i) => (
                <span 
                  key={i} 
                  className={`w-6 h-6 rounded-full font-mono text-[10px] font-black flex items-center justify-center border shadow-xs ${theme.machineBallBg}`}
                >
                  {num}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Footer Branding info */}
      <div className="text-center pt-2 border-t border-white/10 flex flex-col items-center">
        <span className="text-[8px] text-white/70 font-semibold uppercase tracking-wider">
          LOTTO RESULTS BULLETIN
        </span>
        <span className="text-[7px] text-white/50 font-mono mt-0.5">
          18+ PLAY RESPONSIBLY
        </span>
      </div>
    </div>
  );
}
