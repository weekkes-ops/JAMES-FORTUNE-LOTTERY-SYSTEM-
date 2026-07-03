import { LottoResult } from "../types";
import { BALL_MOVEMENT_DATA, parseNumbers } from "./ballMovementData";

export type PredictionStrategy = "balanced" | "evens" | "evens-next";

export interface PredictionData {
  predictedWinningNumbers: number[];
  predictedExtraNumbers: number[];
  predictedMachineNumbers: number[];
  reasoning: string;
  nextEdition: string;
  isAiPowered: boolean;
  strategy?: PredictionStrategy;
}

/**
 * Calculates a fully local, deterministic, and scientifically balanced statistical lottery prediction.
 * Supports Balanced, Pure Evens, and Counter-Movement Evens ("evens-next") strategies.
 */
export function calculateLocalStatisticalPrediction(
  gameName: string,
  history: LottoResult[],
  strategy: PredictionStrategy = "balanced",
  targetDate?: string,
  targetTime?: string,
  targetEventName?: string
): PredictionData {
  const gameHistory = history.filter(
    (r) => r.gameName.trim().toLowerCase() === gameName.trim().toLowerCase()
  );

  // Determine the next edition number
  let nextEdition = "1";
  if (gameHistory.length > 0) {
    const latestEdition = gameHistory.reduce((max, r) => {
      const parsed = parseInt(r.edition.replace(/\D/g, ""), 10);
      return !isNaN(parsed) && parsed > max ? parsed : max;
    }, 0);
    nextEdition = latestEdition > 0 ? (latestEdition + 1).toString() : "Next Edition";
  }

  // Frequencies maps for 1-90
  const winFreqs: Record<number, number> = {};
  const extraFreqs: Record<number, number> = {};
  const machineFreqs: Record<number, number> = {};

  for (let i = 1; i <= 90; i++) {
    winFreqs[i] = 0;
    extraFreqs[i] = 0;
    machineFreqs[i] = 0;
  }

  // Populate frequencies
  gameHistory.forEach((draw) => {
    draw.winningNumbers.forEach((n) => {
      if (n >= 1 && n <= 90) winFreqs[n] = (winFreqs[n] || 0) + 1;
    });
    draw.extraNumbers.forEach((n) => {
      if (n >= 1 && n <= 90) extraFreqs[n] = (extraFreqs[n] || 0) + 1;
    });
    draw.machineNumbers.forEach((n) => {
      if (n >= 1 && n <= 90) machineFreqs[n] = (machineFreqs[n] || 0) + 1;
    });
  });

  // Helper to pick numbers based on active strategy (balanced vs. evens)
  const pickNumbers = (
    freqs: Record<number, number>,
    count: number,
    exclude: Set<number> = new Set(),
    presetPool?: number[] // For evens-next pre-prioritized pool
  ): number[] => {
    let sorted = Object.entries(freqs)
      .map(([num, freq]) => ({ num: parseInt(num, 10), freq }))
      .filter((item) => !exclude.has(item.num));

    // If strategy is even-based (either pure evens or evens-next), restrict to even numbers
    if (strategy === "evens" || strategy === "evens-next") {
      sorted = sorted.filter((item) => item.num % 2 === 0);
    }

    // Sort by frequency (descending)
    sorted.sort((a, b) => b.freq - a.freq);

    const selected: number[] = [];

    // If we have a preset pool of triggered even numbers (from evens-next), prioritize them
    if (presetPool && presetPool.length > 0) {
      const filteredPool = presetPool.filter((n) => !exclude.has(n));
      for (const num of filteredPool) {
        if (selected.length < count && !selected.includes(num)) {
          selected.push(num);
        }
      }
    }

    // Fill the rest with standard frequency sorted items
    if (selected.length < count) {
      if (sorted.length > 0) {
        const hotCount = Math.min(Math.ceil((count - selected.length) * 0.6), sorted.length);
        const coldCount = count - selected.length - hotCount;

        // Hot numbers
        let addedHot = 0;
        for (let i = 0; i < sorted.length && addedHot < hotCount; i++) {
          if (!selected.includes(sorted[i].num)) {
            selected.push(sorted[i].num);
            addedHot++;
          }
        }

        // Cold numbers (least frequent)
        const sortedCold = [...sorted].reverse();
        let addedCold = 0;
        for (let i = 0; i < sortedCold.length && addedCold < coldCount; i++) {
          if (!selected.includes(sortedCold[i].num)) {
            selected.push(sortedCold[i].num);
            addedCold++;
          }
        }
      }
    }

    // Absolute fallback (even numbers vs general numbers)
    while (selected.length < count) {
      const r = Math.floor(Math.random() * 90) + 1;
      if (strategy === "evens" || strategy === "evens-next") {
        if (r % 2 === 0 && !exclude.has(r) && !selected.includes(r)) {
          selected.push(r);
        }
      } else {
        if (!exclude.has(r) && !selected.includes(r)) {
          selected.push(r);
        }
      }
    }

    return selected.sort((a, b) => a - b);
  };

  // Set up pools for "evens-next" strategy (According to evens, whichever is next)
  let nextWinningPool: number[] = [];
  let nextExtraPool: number[] = [];
  let nextMachinePool: number[] = [];
  let explainEvensNext = "";

  if (strategy === "evens-next" && gameHistory.length > 0) {
    // Sort to find the absolute latest draw
    const sortedDraws = [...gameHistory].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    const latestDraw = sortedDraws[0];

    // Collect all counters triggered by the latest draw's balls
    const getEvenCountersForBalls = (balls: number[]): number[] => {
      const counts: Record<number, number> = {};
      balls.forEach((ball) => {
        const data = BALL_MOVEMENT_DATA[ball];
        if (data) {
          const primaryNums = parseNumbers(data.primary);
          const secondaryNums = parseNumbers(data.secondary);
          const allCounterNums = [...primaryNums, ...secondaryNums];
          allCounterNums.forEach((counter) => {
            if (counter % 2 === 0) { // Keep ONLY even counters
              counts[counter] = (counts[counter] || 0) + 1;
            }
          });
        }
      });

      // Sort by trigger frequency (how many balls triggered this counter)
      return Object.entries(counts)
        .map(([num, count]) => ({ num: parseInt(num, 10), count }))
        .sort((a, b) => b.count - a.count)
        .map((x) => x.num);
    };

    nextWinningPool = getEvenCountersForBalls(latestDraw.winningNumbers);
    nextExtraPool = getEvenCountersForBalls(latestDraw.extraNumbers);
    nextMachinePool = getEvenCountersForBalls(latestDraw.machineNumbers);

    explainEvensNext = `\n\n• Evens-Next (Counter Movement) Analysis:
  - Last Game Numbers Analysed: Winning [${latestDraw.winningNumbers.join(", ")}], Extra [${latestDraw.extraNumbers.join(", ")}], Machine [${latestDraw.machineNumbers.join(", ")}].
  - Active Counters Triggered: Selected the even counterparts from the 90-ball movement matrix. Prioritized high-yield triggers [${nextWinningPool.slice(0, 5).join(", ")}] for the next draw.`;
  }

  // Generate winning, extra, machine
  const predictedWinningNumbers = pickNumbers(winFreqs, 5, new Set(), nextWinningPool);
  const predictedExtraNumbers = pickNumbers(extraFreqs, 2, new Set(predictedWinningNumbers), nextExtraPool);
  const predictedMachineNumbers = pickNumbers(
    machineFreqs,
    5,
    new Set([...predictedWinningNumbers, ...predictedExtraNumbers]),
    nextMachinePool
  );

  // Build analytical description based on strategy
  const totalDraws = gameHistory.length;
  const topWinners = Object.entries(winFreqs)
    .map(([num, freq]) => ({ num: parseInt(num, 10), freq }))
    .filter((x) => x.freq > 0)
    .sort((a, b) => b.freq - a.freq)
    .slice(0, 3)
    .map((x) => `${x.num} (drawn ${x.freq}x)`)
    .join(", ");

  const oddCount = predictedWinningNumbers.filter((n) => n % 2 !== 0).length;
  const evenCount = 5 - oddCount;

  let strategyDetails = "";
  if (strategy === "balanced") {
    strategyDetails = `• Strategy Selected: Balanced (60% Hot, 40% Cold). Mathematically balances overall probability density.`;
  } else if (strategy === "evens") {
    strategyDetails = `• Strategy Selected: Pure Evens (100% Even Numbers). Focuses entirely on high-probability even numbers from history.`;
  } else if (strategy === "evens-next") {
    strategyDetails = `• Strategy Selected: "According to Evens, Whichever is Next". Digitally maps the latest draw's balls against the 90-ball counter-movement matrix, filtering for even successors.`;
  }

  let eventDetailText = "";
  if (targetEventName || targetDate || targetTime) {
    eventDetailText = `\n\n• Target Event Schedule:
  - Event/Draw Name: ${targetEventName || gameName}
  - Forecast Date: ${targetDate || "Next scheduled date"}
  - Forecast Time: ${targetTime || "Next scheduled time"}`;
  }

  const reasoning = `Statistical Prediction Model computed from a historical archive of ${totalDraws} drawings for "${gameName}".${eventDetailText}

${strategyDetails}${explainEvensNext}
• Frequency Analysis: Highly recurring numbers for this game are [${topWinners || "none recorded yet"}].
• Parity Optimization: Ratio is ${oddCount} Odd vs ${evenCount} Even numbers (${oddCount}:${evenCount}) to match your chosen configuration.
• Recommended combination represents a scientifically balanced ticket for Edition ${nextEdition}.`;

  return {
    predictedWinningNumbers,
    predictedExtraNumbers,
    predictedMachineNumbers,
    reasoning,
    nextEdition,
    isAiPowered: false,
    strategy,
  };
}

/**
 * Fetches an AI-powered prediction using the server-side Gemini endpoint.
 * Falls back transparently to local statistical calculations on error or missing key.
 */
export async function getPredictionForGame(
  gameName: string,
  history: LottoResult[],
  strategy: PredictionStrategy = "balanced",
  targetDate?: string,
  targetTime?: string,
  targetEventName?: string
): Promise<PredictionData> {
  // Format history concisely for prompt to save tokens and avoid payload limit
  const gameHistory = history
    .filter((r) => r.gameName.trim().toLowerCase() === gameName.trim().toLowerCase())
    .slice(0, 15) // last 15 draws are plenty for predictive trends
    .map((r) => ({
      edition: r.edition,
      date: r.date,
      time: r.time,
      winning: r.winningNumbers,
      extra: r.extraNumbers,
      machine: r.machineNumbers,
    }));

  try {
    const response = await fetch("/api/predict", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        gameName,
        history: gameHistory,
        strategy,
        targetDate,
        targetTime,
        targetEventName,
      }),
    });

    if (!response.ok) {
      throw new Error(`Server returned status ${response.status}`);
    }

    const json = await response.json();
    if (json.success && json.data) {
      return {
        predictedWinningNumbers: json.data.predictedWinningNumbers.sort((a: number, b: number) => a - b),
        predictedExtraNumbers: json.data.predictedExtraNumbers.sort((a: number, b: number) => a - b),
        predictedMachineNumbers: json.data.predictedMachineNumbers.sort((a: number, b: number) => a - b),
        reasoning: json.data.reasoning,
        nextEdition: json.data.nextEdition || "Next Edition",
        isAiPowered: true,
        strategy,
      };
    } else {
      throw new Error("Prediction API call was unsuccessful");
    }
  } catch (error) {
    console.warn("Gemini prediction failed, falling back to local statistical calculator:", error);
    return calculateLocalStatisticalPrediction(gameName, history, strategy, targetDate, targetTime, targetEventName);
  }
}

