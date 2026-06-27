export interface LottoResult {
  id: string;
  gameName: string;
  date: string;
  time: string;
  edition: string;
  winningNumbers: number[];
  extraNumbers: number[];
  machineNumbers: number[];
  sourceImageIndex?: number;
}

export interface ExtractionStats {
  totalDraws: number;
  mostFrequentWinning: { number: number; count: number }[];
  mostFrequentMachine: { number: number; count: number }[];
  oddEvenRatio: { odd: number; even: number };
}
