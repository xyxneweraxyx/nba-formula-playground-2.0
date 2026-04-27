// engine.js — NBA Formula Playground V3
// N_STATS=28, interleaved A/B (even=A, odd=B)
// Opcodes: 0-27 stats, 28-34 binops, 35-38 unops, 39 CONST_PH

export const N_STATS = 28;
export const CONST_PLACEHOLDER = 39;
export const N_OPCODES = 40;

export const THRESH_N_BUCKETS = 7;
export const THRESH_BUCKET_LO = -3;
export const THRESH_BUCKET_HI = 3;

export const CONST_GRID = [
  -50, -20, -10, -5, -3, -2, -1, -0.5, -0.2, -0.1,
   0.1, 0.2, 0.5, 1, 2, 3, 5, 10, 20, 50,
];

// stat index → string name (matches nodes.h exactly)
export const STAT_NAMES = [
  /* 0-1  */ 'A_rest',     'B_rest',
  /* 2-3  */ 'A_density',  'B_density',
  /* 4-5  */ 'A_streak',   'B_streak',
  /* 6-7  */ 'A_W_s',      'B_W_s',
  /* 8-9  */ 'A_ORTG_s',   'B_ORTG_s',
  /* 10-11*/ 'A_DRTG_s',   'B_DRTG_s',
  /* 12-13*/ 'A_MOV_s',    'B_MOV_s',
  /* 14-15*/ 'A_elo',      'B_elo',
  /* 16-17*/ 'A_ORTG_l3',  'B_ORTG_l3',
  /* 18-19*/ 'A_DRTG_l3',  'B_DRTG_l3',
  /* 20-21*/ 'A_MOV_l3',   'B_MOV_l3',
  /* 22-23*/ 'A_ORTG_l10', 'B_ORTG_l10',
  /* 24-25*/ 'A_DRTG_l10', 'B_DRTG_l10',
  /* 26-27*/ 'A_MOV_l10',  'B_MOV_l10',
];

// op index relative to N_STATS → string name (11 ops: 7 binops + 4 unops)
export const OP_NAMES = ['+','-','*','/','max','min','pow','abs','sqrt','log10','log2'];

// ── Classification ───────────────────────────────────────────────────────────
export const isStat  = op => op >= 0  && op < N_STATS;
export const isBinop = op => op >= 28 && op <= 34;   // 28=+ 29=- 30=* 31=/ 32=max 33=min 34=pow
export const isUnop  = op => op >= 35 && op <= 38;   // 35=abs 36=sqrt 37=log10 38=log2
export const isConst = op => op === CONST_PLACEHOLDER;
export const isLeaf  = op => isStat(op) || isConst(op);
export const isAStat = op => isStat(op) && (op & 1) === 0; // even index = A (home)
export const isBStat = op => isStat(op) && (op & 1) === 1; // odd  index = B (away)

// ── Stack simulation ─────────────────────────────────────────────────────────
export function simulateStack(opcodes) {
  let h = 0;
  for (const op of opcodes) {
    if (isLeaf(op))       { h++; if (h > 16) return -1; }
    else if (isUnop(op))  { if (h < 1) return -1; }
    else if (isBinop(op)) { if (h < 2) return -1; h--; }
  }
  return h;
}

// ── Formula printing ─────────────────────────────────────────────────────────
// Operator precedence for infix formatting
const _prec = op => {
  if (op === 28 || op === 29) return 1; // + -
  if (op === 30 || op === 31) return 2; // * /
  if (op === 34) return 3;              // pow
  return 4;                             // max min → function notation
};

function _buildStr(opcodes, getConst) {
  const stack = []; let ci = 0;
  for (const op of opcodes) {
    if (isStat(op)) {
      stack.push({ s: STAT_NAMES[op], p: 10 });
    } else if (isConst(op)) {
      stack.push({ s: getConst(ci++), p: 10 });
    } else if (isUnop(op)) {
      if (!stack.length) return '<invalide>';
      const a = stack[stack.length-1];
      const name = OP_NAMES[op - 28]; // abs=OP_NAMES[7], log2=OP_NAMES[10]
      stack[stack.length-1] = { s: `${name}(${a.s})`, p: 10 };
    } else if (isBinop(op)) {
      if (stack.length < 2) return '<invalide>';
      const b = stack.pop(); const a = stack[stack.length-1];
      const prec = _prec(op);
      const name = OP_NAMES[op - 28]; // +=OP_NAMES[0], pow=OP_NAMES[6]
      const af = a.p < prec ? `(${a.s})` : a.s;
      const bf = b.p < prec ? `(${b.s})` : b.s;
      const s  = prec <= 3 ? `${af} ${name} ${bf}` : `${name}(${a.s}, ${b.s})`;
      stack[stack.length-1] = { s, p: prec };
    }
  }
  return stack.length === 1 ? stack[0].s : stack.length === 0 ? '' : '<invalide>';
}

// Returns partial stack labels (for the live preview while building)
export function formulaStack(opcodes) {
  const parts = []; let ci = 0;
  const stk = [];
  for (const op of opcodes) {
    if (isStat(op)) {
      stk.push({ s: STAT_NAMES[op], p: 10 });
    } else if (isConst(op)) {
      stk.push({ s: `?${ci > 0 ? ci + 1 : ''}`, p: 10 }); ci++;
    } else if (isUnop(op)) {
      if (!stk.length) break;
      const a = stk[stk.length-1];
      stk[stk.length-1] = { s: `${OP_NAMES[op-28]}(${a.s})`, p: 10 };
    } else if (isBinop(op)) {
      if (stk.length < 2) break;
      const b = stk.pop(); const a = stk[stk.length-1];
      const prec = _prec(op), name = OP_NAMES[op-28];
      const af = a.p < prec ? `(${a.s})` : a.s;
      const bf = b.p < prec ? `(${b.s})` : b.s;
      const s = prec <= 3 ? `${af} ${name} ${bf}` : `${name}(${a.s}, ${b.s})`;
      stk[stk.length-1] = { s, p: prec };
    }
  }
  return stk.map(i => i.s);
}

export const formulaToStr = (opcodes, consts = null) =>
  _buildStr(opcodes, ci => consts && ci < consts.length
    ? Number(consts[ci].toFixed(4)).toString() : '?');

// ── RPN Evaluator ────────────────────────────────────────────────────────────
function evalOne(opcodes, consts, stats) {
  const stack = []; let ci = 0;
  for (const op of opcodes) {
    if (isStat(op)) {
      stack.push(stats[op]);
    } else if (isConst(op)) {
      stack.push(consts && ci < consts.length ? consts[ci++] : 0);
    } else if (isUnop(op)) {
      if (!stack.length) return NaN;
      const a = stack[stack.length-1];
      switch (op) {
        case 35: stack[stack.length-1] = Math.abs(a); break;
        case 36: stack[stack.length-1] = Math.sqrt(Math.abs(a)); break;
        case 37: stack[stack.length-1] = Math.log10(Math.abs(a)+1e-9); break;
        case 38: stack[stack.length-1] = Math.log2(Math.abs(a)+1e-9); break;
      }
    } else if (isBinop(op)) {
      if (stack.length < 2) return NaN;
      const b = stack.pop(); const a = stack[stack.length-1];
      switch (op) {
        case 28: stack[stack.length-1] = a+b; break;
        case 29: stack[stack.length-1] = a-b; break;
        case 30: stack[stack.length-1] = a*b; break;
        case 31: stack[stack.length-1] = Math.abs(b)>1e-9 ? a/b : 0; break;
        case 32: stack[stack.length-1] = Math.max(a,b); break;
        case 33: stack[stack.length-1] = Math.min(a,b); break;
        case 34: {
          const r = Math.pow(Math.abs(a), b);
          stack[stack.length-1] = (isFinite(r) && r < 1e6) ? r : 0; break;
        }
      }
    }
  }
  const r = stack.length === 1 ? stack[0] : NaN;
  return isFinite(r) ? r : 0;
}

export const evalAll = (opcodes, consts, matches) =>
  matches.map(m => evalOne(opcodes, consts, m.stats));

// ── Single threshold O(n log n) ──────────────────────────────────────────────
export function optimalThreshold(outputs, labels) {
  const n = outputs.length;
  const paired = outputs.map((v,i) => [v, labels[i]]).sort((a,b) => a[0]-b[0]);
  let correct = labels.filter(l => l===1).length;
  let bestCorrect = correct, bestThresh = paired.length ? paired[0][0]-1 : 0;
  for (let i = 0; i < n; i++) {
    if (paired[i][1]===1) correct--; else correct++;
    const t = i < n-1 ? (paired[i][0]+paired[i+1][0])/2 : paired[i][0]+1;
    if (correct > bestCorrect) { bestCorrect = correct; bestThresh = t; }
  }
  return { threshold: bestThresh, accuracy: n > 0 ? bestCorrect/n : 0 };
}

// ── Bucketed threshold ────────────────────────────────────────────────────────
function _bucketIdx(v, boundaries) {
  for (let b = 0; b < boundaries.length; b++) if (v <= boundaries[b]) return b;
  return boundaries.length;
}

export function buildBucketBoundaries(modifier, quantileMode) {
  const N = modifier.length;
  const N_BOUNDS = THRESH_N_BUCKETS - 1;
  if (!quantileMode) {
    // Integer mode: fixed [-2.5, -1.5, -0.5, 0.5, 1.5, 2.5]
    return Array.from({length: N_BOUNDS}, (_, b) => THRESH_BUCKET_LO + b + 0.5);
  }
  const sorted = [...modifier].sort((a, b) => a - b);
  return Array.from({length: N_BOUNDS}, (_, b) => {
    const idx = Math.max(0, Math.min(N-1, Math.floor((b+1)/THRESH_N_BUCKETS*N)));
    const prev = Math.max(0, idx-1);
    return (sorted[idx] + sorted[prev]) * 0.5;
  });
}

export function optimalThresholdBucketed(outputs, modifier, labels, quantileMode, inBoundaries = null) {
  const N = outputs.length;
  const boundaries = inBoundaries ?? buildBucketBoundaries(modifier, quantileMode);

  const bucketThresholds = new Array(THRESH_N_BUCKETS).fill(0);
  const bucketCounts     = new Array(THRESH_N_BUCKETS).fill(0);
  let totalCorrect = 0;

  for (let b = 0; b < THRESH_N_BUCKETS; b++) {
    const bOut = [], bLab = [];
    for (let i = 0; i < N; i++) {
      if (_bucketIdx(modifier[i], boundaries) === b) { bOut.push(outputs[i]); bLab.push(labels[i]); }
    }
    bucketCounts[b] = bOut.length;
    if (!bOut.length) continue;
    const { threshold, accuracy } = optimalThreshold(bOut, bLab);
    bucketThresholds[b] = threshold;
    totalCorrect += Math.round(accuracy * bOut.length);
  }

  return {
    accuracy: N > 0 ? totalCorrect / N : 0,
    bucketThresholds, bucketCounts, boundaries,
  };
}

// ── Prediction (bucket-aware) ────────────────────────────────────────────────
export function predictMatch(formulaVal, matchStats, optimResult) {
  const { threshold, threshModStat, bucketThresholds, bucketBoundaries, quantileMode } = optimResult;
  if (threshModStat < 0 || !bucketThresholds) return formulaVal > threshold;

  const aIdx = threshModStat & ~1; // round down to even (A stat)
  const bIdx = aIdx + 1;
  const mod = matchStats[aIdx] - matchStats[bIdx];
  const bounds = bucketBoundaries && bucketBoundaries.some(b => b !== 0)
    ? bucketBoundaries
    : buildBucketBoundaries([mod], quantileMode);
  return formulaVal > bucketThresholds[_bucketIdx(mod, bounds)];
}

// ── Accuracy (bucket-aware) ──────────────────────────────────────────────────
export function computeAccuracy(outputs, labels, optimResult, indices, matches) {
  const idx = indices ?? Array.from({length: outputs.length}, (_, i) => i);
  if (!idx.length) return null;
  let correct = 0;
  for (const i of idx) {
    const pred = optimResult.threshModStat >= 0 && optimResult.bucketThresholds && matches
      ? predictMatch(outputs[i], matches[i].stats, optimResult)
      : outputs[i] > optimResult.threshold;
    if (pred === (labels[i] === 1)) correct++;
  }
  return correct / idx.length;
}

// ── Full optimization (consts + threshold) ───────────────────────────────────
export function optimize(opcodes, matches, threshModStat = -1, quantileMode = false) {
  const labels = matches.map(m => m.a_wins);
  const nPh    = opcodes.filter(isConst).length;
  let best = { score: -1, threshold: 0, consts: [], bucketThresholds: null, bucketBoundaries: null, bucketCounts: null };

  const tryConsts = (consts) => {
    const outputs = evalAll(opcodes, consts, matches);
    if (threshModStat >= 0) {
      const aIdx = threshModStat & ~1;
      const modifier = matches.map(m => m.stats[aIdx] - m.stats[aIdx+1]);
      const { accuracy, bucketThresholds, bucketCounts, boundaries } =
        optimalThresholdBucketed(outputs, modifier, labels, quantileMode);
      if (accuracy > best.score) {
        best = { score: accuracy, threshold: 0, consts: [...consts],
                 bucketThresholds, bucketCounts, bucketBoundaries: boundaries };
      }
    } else {
      const { threshold, accuracy } = optimalThreshold(outputs, labels);
      if (accuracy > best.score) best = { ...best, score: accuracy, threshold, consts: [...consts] };
    }
  };

  if (nPh === 0) tryConsts([]);
  else if (nPh === 1) CONST_GRID.forEach(c => tryConsts([c]));
  else CONST_GRID.forEach(c0 => CONST_GRID.forEach(c1 => tryConsts([c0, c1])));

  return { ...best, nPh, threshModStat, quantileMode };
}

// ── Pearson correlation ───────────────────────────────────────────────────────
export function pearsonCorrelation(outputs, labels) {
  const n = outputs.length;
  const mx = outputs.reduce((a,b) => a+b, 0)/n;
  const my = labels.reduce((a,b) => a+b, 0)/n;
  let num=0, dx=0, dy=0;
  for (let i=0; i<n; i++) {
    const ex=outputs[i]-mx, ey=labels[i]-my;
    num+=ex*ey; dx+=ex*ex; dy+=ey*ey;
  }
  return dx===0||dy===0 ? 0 : num/Math.sqrt(dx*dy);
}

// ── Worst consecutive loss streak ────────────────────────────────────────────
export function worstStreak(outputs, labels, optimResult, matches) {
  let worst=0, cur=0;
  for (let i=0; i<outputs.length; i++) {
    const pred = optimResult.threshModStat >= 0 && optimResult.bucketThresholds
      ? predictMatch(outputs[i], matches[i].stats, optimResult)
      : outputs[i] > optimResult.threshold;
    if (pred !== (labels[i]===1)) { cur++; if (cur>worst) worst=cur; }
    else cur=0;
  }
  return worst;
}

// ── ROI simulation ────────────────────────────────────────────────────────────
export function simulateROI(outputs, labels, optimResult, matches, oddsWin=1.87, confThreshold=0) {
  let units=0, bets=0, wins=0;
  for (let i=0; i<outputs.length; i++) {
    if (confThreshold > 0 && Math.abs(outputs[i]-optimResult.threshold) < confThreshold) continue;
    bets++;
    const pred = optimResult.threshModStat >= 0 && optimResult.bucketThresholds
      ? predictMatch(outputs[i], matches[i].stats, optimResult)
      : outputs[i] > optimResult.threshold;
    if (pred === (labels[i]===1)) { units += oddsWin-1; wins++; } else units -= 1;
  }
  return { bets, wins, roi: bets>0?units/bets:0, totalUnits:units, winRate:bets>0?wins/bets:0 };
}
