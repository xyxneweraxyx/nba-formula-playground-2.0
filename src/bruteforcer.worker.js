// bruteforcer.worker.js — V3 Web Worker
// Opcodes: 0-27 stats, 28-34 binops, 35-38 unops, 39 CONST_PH
import { generateAll } from './generator.js';
import { evalAll, optimalThreshold, formulaToStr, STAT_NAMES, OP_NAMES } from './engine.js';

const N_STATS  = 28;
const CONST_PH = 39;
const TOP_N    = 50;
const TOP_SAMPLE = 200;

// ── Stat/op tracking ──────────────────────────────────────────────────────────
function initStats() {
  return {
    processed: 0,
    byStat: Array.from({length: N_STATS}, (_, i) => ({
      name: STAT_NAMES[i], appearances: 0, scoreSum: 0, scores: [],
    })),
    byOp: Array.from({length: 11}, (_, i) => ({
      name: OP_NAMES[i], opcode: 28+i, appearances: 0, scoreSum: 0, scores: [],
    })),
    bySize: {},
    distribution: new Array(30).fill(0), // 0.45–0.75
    topFormulas: [],
  };
}

function insertTopScore(arr, score) {
  let lo=0, hi=arr.length;
  while (lo<hi) { const mid=(lo+hi)>>1; arr[mid]>score?lo=mid+1:hi=mid; }
  arr.splice(lo, 0, score);
  if (arr.length > TOP_SAMPLE) arr.pop();
}

function percentile(sortedDesc, pct) {
  if (!sortedDesc.length) return null;
  const idx = Math.floor((1-pct) * (sortedDesc.length-1));
  return sortedDesc[Math.max(0, Math.min(sortedDesc.length-1, idx))];
}

function bucketIdx(score) {
  const idx = Math.floor((score - 0.45) / 0.01);
  return Math.max(0, Math.min(29, idx));
}

function processFormula(formula, score, stats) {
  stats.processed++;
  stats.distribution[bucketIdx(score)]++;

  const size = formula.length;
  if (!stats.bySize[size]) stats.bySize[size] = { count:0, scoreSum:0, best:0 };
  const bs = stats.bySize[size];
  bs.count++; bs.scoreSum+=score;
  if (score > bs.best) bs.best = score;

  const seenStat = new Set(), seenOp = new Set();
  for (let i=0; i<formula.length; i++) {
    const op = formula[i];
    if (op < N_STATS && !seenStat.has(op)) {
      seenStat.add(op);
      const s = stats.byStat[op];
      s.appearances++; s.scoreSum+=score;
      insertTopScore(s.scores, score);
    } else if (op >= 28 && op <= 38 && !seenOp.has(op)) {
      seenOp.add(op);
      const o = stats.byOp[op-28];
      o.appearances++; o.scoreSum+=score;
      insertTopScore(o.scores, score);
    }
  }
}

function updateTopFormulas(top, opcodes, score, str) {
  if (top.length < TOP_N || score > top[top.length-1].score) {
    top.push({ opcodes: Array.from(opcodes), score, str });
    top.sort((a,b) => b.score-a.score);
    if (top.length > TOP_N) top.length = TOP_N;
  }
}

function serializeStats(stats) {
  return {
    processed: stats.processed,
    byStat: stats.byStat.map(s => ({
      name: s.name, appearances: s.appearances,
      mean: s.appearances>0 ? s.scoreSum/s.appearances : 0,
      top25: percentile(s.scores, 0.25),
      top10: percentile(s.scores, 0.10),
      top1:  percentile(s.scores, 0.01),
      max:   s.scores[0] ?? 0,
    })),
    byOp: stats.byOp.map(o => ({
      name: o.name, opcode: o.opcode, appearances: o.appearances,
      mean: o.appearances>0 ? o.scoreSum/o.appearances : 0,
      top25: percentile(o.scores, 0.25),
      top10: percentile(o.scores, 0.10),
      top1:  percentile(o.scores, 0.01),
      max:   o.scores[0] ?? 0,
    })),
    bySize: Object.entries(stats.bySize).map(([size,d]) => ({
      size:+size, count:d.count, mean:d.count>0?d.scoreSum/d.count:0, best:d.best,
    })).sort((a,b) => a.size-b.size),
    distribution: stats.distribution,
    topFormulas: stats.topFormulas,
  };
}

// ── Worker entry point ────────────────────────────────────────────────────────
let shouldStop = false;

self.onmessage = e => {
  if (e.data.type === 'stop') { shouldStop=true; return; }
  if (e.data.type === 'start') runAnalysis(e.data);
};

function runAnalysis({ maxSize, ignoredStats, noConst, matches }) {
  shouldStop = false;
  const labels = matches.map(m => m.a_wins);
  const stats  = initStats();
  const gen    = generateAll(maxSize, new Set(ignoredStats), noConst);
  let lastUpdate = performance.now();
  const outputs = new Float32Array(matches.length);

  function processBatch() {
    if (shouldStop) {
      self.postMessage({ type:'done', stats: serializeStats(stats) });
      return;
    }

    const batchStart = performance.now();

    while (performance.now()-batchStart < 40) {
      const { value: formula, done } = gen.next();
      if (done) {
        self.postMessage({ type:'done', stats: serializeStats(stats) });
        return;
      }

      // Fast RPN eval with V3 opcodes (threshold=0, consts=0)
      for (let m=0; m<matches.length; m++) {
        const s = matches[m].stats;
        const stack = new Float32Array(16);
        let top=-1, ci=0, ok=true;
        for (let i=0; i<formula.length && ok; i++) {
          const op=formula[i];
          if (op < N_STATS) {
            stack[++top] = s[op];
          } else if (op === CONST_PH) {
            stack[++top] = 0; ci++;
          } else if (op >= 35 && op <= 38) {
            const a=stack[top];
            switch(op) {
              case 35: stack[top]=Math.abs(a); break;
              case 36: stack[top]=Math.sqrt(Math.abs(a)); break;
              case 37: stack[top]=Math.log10(Math.abs(a)+1e-9); break;
              case 38: stack[top]=Math.log2(Math.abs(a)+1e-9); break;
            }
          } else {
            const b=stack[top--], a=stack[top];
            switch(op) {
              case 28: stack[top]=a+b; break;
              case 29: stack[top]=a-b; break;
              case 30: stack[top]=a*b; break;
              case 31: stack[top]=Math.abs(b)>1e-9?a/b:0; break;
              case 32: stack[top]=Math.max(a,b); break;
              case 33: stack[top]=Math.min(a,b); break;
              case 34: { const r=Math.pow(Math.abs(a),b); stack[top]=(isFinite(r)&&r<1e6)?r:0; break; }
            }
          }
        }
        outputs[m] = (ok && top===0 && isFinite(stack[0])) ? stack[0] : 0;
      }

      const { accuracy: score } = optimalThreshold(Array.from(outputs), labels);
      processFormula(formula, score, stats);

      if (stats.topFormulas.length < TOP_N || score > stats.topFormulas[stats.topFormulas.length-1]?.score) {
        const str = formulaToStr(Array.from(formula));
        updateTopFormulas(stats.topFormulas, formula, score, str);
      }
    }

    if (performance.now()-lastUpdate > 300) {
      self.postMessage({ type:'update', stats: serializeStats(stats) });
      lastUpdate = performance.now();
    }

    setTimeout(processBatch, 0);
  }

  setTimeout(processBatch, 0);
}
