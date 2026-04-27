import { useState, useMemo, useCallback } from 'react';
import {
  simulateStack, formulaStack, formulaToStr,
  evalAll, optimize, computeAccuracy, predictMatch,
  pearsonCorrelation, worstStreak, simulateROI, isConst,
} from '../engine';

const WINAMAX_ODDS   = 1.87;
export const BREAKEVEN_RATE = 1 / WINAMAX_ODDS; // ~0.5348

export default function useFormula(matches, threshModStat = -1, quantileMode = false) {
  const [opcodes, setOpcodes] = useState([]);

  const stackHeight  = useMemo(() => simulateStack(opcodes), [opcodes]);
  const isComplete   = stackHeight === 1 && opcodes.length > 0;
  const partialStack = useMemo(() => formulaStack(opcodes), [opcodes]);
  const nPh          = useMemo(() => opcodes.filter(isConst).length, [opcodes]);

  const results = useMemo(() => {
    if (!matches?.length || !isComplete) return null;

    const labels     = matches.map(m => m.a_wins);
    const optimResult = optimize(opcodes, matches, threshModStat, quantileMode);
    const { score, threshold, consts, bucketThresholds, bucketBoundaries, bucketCounts } = optimResult;
    const outputs    = evalAll(opcodes, consts, matches);

    // ── Helpers ──────────────────────────────────────────────────────────────
    const idxWhere = pred => matches.map((m,i) => pred(m,i)?i:-1).filter(i=>i>=0);
    const seg      = idx => computeAccuracy(outputs, labels, optimResult, idx, matches);

    // ── By season ────────────────────────────────────────────────────────────
    const seasons  = [...new Set(matches.map(m=>m.season))].sort();
    const bySeason = seasons.map(s => {
      const idx = idxWhere(m => m.season===s);
      return { season:s, score:seg(idx), n:idx.length };
    });
    const seasonScores = bySeason.map(s=>s.score).filter(s=>s!=null);
    const seasonMean   = seasonScores.length ? seasonScores.reduce((a,b)=>a+b,0)/seasonScores.length : 0;
    const seasonStdDev = seasonScores.length
      ? Math.sqrt(seasonScores.reduce((a,b)=>a+(b-seasonMean)**2,0)/seasonScores.length)
      : 0;

    // ── Temporal validation ───────────────────────────────────────────────────
    let trainTest = null;
    if (seasons.length >= 2) {
      const trainSeasons = seasons.slice(0,-1);
      const testSeason   = seasons[seasons.length-1];
      const trainM = matches.filter(m=>trainSeasons.includes(m.season));
      const testM  = matches.filter(m=>m.season===testSeason);
      if (trainM.length && testM.length) {
        const trainOpt    = optimize(opcodes, trainM, threshModStat, quantileMode);
        const testOut     = evalAll(opcodes, trainOpt.consts, testM);
        const testLabels  = testM.map(m=>m.a_wins);
        const testScore   = computeAccuracy(testOut, testLabels, trainOpt, null, testM);
        trainTest = { trainScore:trainOpt.score, testScore, testSeason };
      }
    }

    // ── Home vs Away prediction quality ──────────────────────────────────────
    // homeScore = accuracy on matches where home team actually won
    // awayScore = accuracy on matches where away team actually won
    const homeIdx = idxWhere(m=>m.a_wins===1);
    const awayIdx = idxWhere(m=>m.a_wins===0);

    // ── By MOV gap (strength differential) ───────────────────────────────────
    // V3: use MOV_s differential. stats[12]=A_MOV_s, stats[13]=B_MOV_s
    const closeIdx    = idxWhere(m=>Math.abs(m.stats[12]-m.stats[13])<3);
    const mediumIdx   = idxWhere(m=>{const g=Math.abs(m.stats[12]-m.stats[13]);return g>=3&&g<8;});
    const mismatchIdx = idxWhere(m=>Math.abs(m.stats[12]-m.stats[13])>=8);

    // ── By month ──────────────────────────────────────────────────────────────
    const months  = [...new Set(matches.map(m=>m.month))].sort();
    const byMonth = months.map(mo => {
      const idx = idxWhere(m=>m.month===mo);
      return { month:mo.slice(5), score:seg(idx), n:idx.length };
    });

    // ── By Elo gap (instead of gamesPlayed in V1) ─────────────────────────────
    // Use A_elo (stats[14]) and B_elo (stats[15]) differential as a phase proxy
    const eloBuckets = [[0,25],[25,50],[50,100],[100,200],[200,Infinity]];
    const byEloDiff = eloBuckets.map(([lo,hi]) => {
      const idx = idxWhere(m=>{const d=Math.abs(m.stats[14]-m.stats[15]); return d>=lo&&d<hi;});
      return idx.length ? { range:`${lo===Infinity?'200+':lo}-${hi===Infinity?'+':hi}`, score:seg(idx), n:idx.length } : null;
    }).filter(Boolean);

    // ── Distribution of outputs ───────────────────────────────────────────────
    let minO=Infinity, maxO=-Infinity;
    for (const v of outputs) { if(v<minO) minO=v; if(v>maxO) maxO=v; }
    const N_BUCKETS=24, bSize=(maxO-minO)/N_BUCKETS||1;
    const distribution = Array.from({length:N_BUCKETS},(_,k)=>{
      const lo=minO+k*bSize, hi=lo+bSize;
      const idx=outputs.map((v,i)=>(v>=lo&&(k===N_BUCKETS-1?v<=hi:v<hi))?i:-1).filter(i=>i>=0);
      if (!idx.length) return null;
      let correct=0;
      for (const i of idx) {
        const pred = optimResult.threshModStat>=0 && optimResult.bucketThresholds && matches
          ? predictMatch(outputs[i], matches[i].stats, optimResult)
          : outputs[i] > threshold;
        if (pred===(labels[i]===1)) correct++;
      }
      return { x:((lo+hi)/2).toFixed(2), correct, incorrect:idx.length-correct, n:idx.length };
    }).filter(Boolean);

    // ── Confidence vs accuracy ────────────────────────────────────────────────
    const confData = outputs
      .map((v,i)=>{
        const pred = optimResult.threshModStat>=0 && optimResult.bucketThresholds
          ? predictMatch(v, matches[i].stats, optimResult)
          : v > threshold;
        return {conf:Math.abs(v-threshold),correct:pred===(labels[i]===1)};
      })
      .sort((a,b)=>a.conf-b.conf);
    const N_DECILES=10, chunkSz=Math.ceil(confData.length/N_DECILES);
    const confidence = Array.from({length:N_DECILES},(_,k)=>{
      const chunk=confData.slice(k*chunkSz,(k+1)*chunkSz);
      if (!chunk.length) return null;
      const acc=chunk.filter(c=>c.correct).length/chunk.length;
      const avgC=chunk.reduce((s,c)=>s+c.conf,0)/chunk.length;
      return { decile:k+1, accuracy:+(acc*100).toFixed(1), confidence:+avgC.toFixed(3) };
    }).filter(Boolean);

    // ── Confusion matrix ──────────────────────────────────────────────────────
    let tp=0,tn=0,fp=0,fn=0;
    for (let i=0;i<outputs.length;i++) {
      const pred = optimResult.threshModStat>=0 && optimResult.bucketThresholds
        ? predictMatch(outputs[i], matches[i].stats, optimResult)
        : outputs[i]>threshold;
      const real=labels[i]===1;
      if (pred&&real) tp++;
      else if (!pred&&!real) tn++;
      else if (pred&&!real) fp++;
      else fn++;
    }
    const biasSide  = fp>fn?'A (home)':fp<fn?'B (away)':'neutre';
    const biasRatio = fp+fn>0?Math.abs(fp-fn)/(fp+fn):0;

    // ── Misc stats ────────────────────────────────────────────────────────────
    const correlation = pearsonCorrelation(outputs, labels);
    const wLoss       = worstStreak(outputs, labels, optimResult, matches);

    // ── ROI simulation ────────────────────────────────────────────────────────
    const roiAll   = simulateROI(outputs, labels, optimResult, matches, WINAMAX_ODDS, 0);
    const confVals = outputs.map(v=>Math.abs(v-threshold)).sort((a,b)=>a-b);
    const c25 = confVals[Math.floor(confVals.length*0.75)] ?? 0;
    const c10 = confVals[Math.floor(confVals.length*0.90)] ?? 0;
    const roiTop25 = simulateROI(outputs, labels, optimResult, matches, WINAMAX_ODDS, c25);
    const roiTop10 = simulateROI(outputs, labels, optimResult, matches, WINAMAX_ODDS, c10);

    return {
      score, threshold, consts, nPh,
      outputs,
      formulaStrConsts: formulaToStr(opcodes, consts),
      optimResult,
      // Bucket info
      bucketThresholds, bucketBoundaries, bucketCounts,
      threshModStat, quantileMode,
      // By season
      bySeason, seasonStdDev, trainTest,
      // Segmentation
      homeScore: seg(homeIdx), awayScore: seg(awayIdx), homeRate: homeIdx.length/matches.length,
      byGap: {
        close:    { score:seg(closeIdx),    n:closeIdx.length },
        medium:   { score:seg(mediumIdx),   n:mediumIdx.length },
        mismatch: { score:seg(mismatchIdx), n:mismatchIdx.length },
      },
      byMonth, byEloDiff,
      // Charts
      distribution, confidence,
      // Risk stats
      tp, tn, fp, fn, biasSide, biasRatio,
      correlation,
      worstLoss: wLoss,
      roiAll, roiTop25, roiTop10,
      breakEven: BREAKEVEN_RATE,
      winamaxOdds: WINAMAX_ODDS,
    };
  }, [opcodes, matches, isComplete, threshModStat, quantileMode]);

  const push      = useCallback(op  => setOpcodes(prev => [...prev, op]), []);
  const undo      = useCallback(()  => setOpcodes(prev => prev.slice(0,-1)), []);
  const clear     = useCallback(()  => setOpcodes([]), []);
  const loadOpcodes = useCallback(ops => setOpcodes([...ops]), []);

  return { opcodes, stackHeight, isComplete, partialStack, nPh, results, push, undo, clear, loadOpcodes };
}
