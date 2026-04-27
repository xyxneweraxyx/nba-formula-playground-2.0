// generator.js — V3 iterative RPN formula generator with pruning
// Port of search.c with V3 opcode layout (N_STATS=28, N_OPCODES=40)

const N_STATS   = 28;
const N_OPCODES = 40;
const CONST_PH  = 39;
const STACK_SIZE = 16;

// Stat domains from eval.c g_stat_lo / g_stat_hi
const STAT_LO = [
  /* 0-1  rest     */  1,  1,
  /* 2-3  density  */  0,  0,
  /* 4-5  streak   */ -82,-82,
  /* 6-7  W_s      */  0,  0,
  /* 8-9  ORTG_s   */ 85, 85,
  /* 10-11 DRTG_s  */ 85, 85,
  /* 12-13 MOV_s   */-35,-35,
  /* 14-15 elo     */1200,1200,
  /* 16-17 ORTG_l3 */ 70, 70,
  /* 18-19 DRTG_l3 */ 70, 70,
  /* 20-21 MOV_l3  */-60,-60,
  /* 22-23 ORTG_l10*/ 78, 78,
  /* 24-25 DRTG_l10*/ 78, 78,
  /* 26-27 MOV_l10 */-45,-45,
];
const STAT_HI = [
  /* 0-1  rest     */ 14, 14,
  /* 2-3  density  */  7,  7,
  /* 4-5  streak   */ 82, 82,
  /* 6-7  W_s      */ 82, 82,
  /* 8-9  ORTG_s   */140,140,
  /* 10-11 DRTG_s  */140,140,
  /* 12-13 MOV_s   */ 35, 35,
  /* 14-15 elo     */1800,1800,
  /* 16-17 ORTG_l3 */155,155,
  /* 18-19 DRTG_l3 */155,155,
  /* 20-21 MOV_l3  */ 60, 60,
  /* 22-23 ORTG_l10*/148,148,
  /* 24-25 DRTG_l10*/148,148,
  /* 26-27 MOV_l10 */ 45, 45,
];

// Opcode classification
const isLeaf  = op => op < N_STATS || op === CONST_PH;
const isBinop = op => op >= 28 && op <= 34;
const isUnop  = op => op >= 35 && op <= 38;
const isAStat = op => op < N_STATS && (op & 1) === 0;
const isBStat = op => op < N_STATS && (op & 1) === 1;
const commutes= op => op===28||op===30||op===32||op===33; // + * max min

function completable(h, rem) {
  return (h - rem) <= 1 && (h + rem) >= 1;
}

// Update pure-const bitmask
function updatePh(ph, sh, op) {
  if (op === CONST_PH) return ph | (1 << sh);
  if (op < N_STATS) {
    // A stat with domain of single point is effectively a constant
    return STAT_LO[op] === STAT_HI[op]
      ? ph | (1 << sh)
      : ph & ~(1 << sh);
  }
  if (isUnop(op)) return ph; // top retains its flag
  // binop: result is pure iff both operands are pure
  const lp = (ph >> (sh-2)) & 1;
  const rp = (ph >> (sh-1)) & 1;
  return (lp && rp) ? ph | (1 << (sh-2)) : ph & ~(1 << (sh-2));
}

// Check if two subtrees of formula are identical
function subtreesIdentical(formula, startA, endA, startB, endB) {
  const lenA = endA - startA + 1, lenB = endB - startB + 1;
  if (lenA !== lenB) return false;
  for (let i = 0; i < lenA; i++) if (formula[startA+i] !== formula[startB+i]) return false;
  return true;
}

// Root rule: last op = binop, formula must contain ≥1 A stat AND ≥1 B stat
function passesRootRule(formula, len) {
  if (len < 1 || !isBinop(formula[len-1])) return false;
  let hasA=false, hasB=false;
  for (let i=0; i<len; i++) {
    if (isAStat(formula[i])) hasA=true;
    if (isBStat(formula[i])) hasB=true;
    if (hasA && hasB) return true;
  }
  return false;
}

// Interval propagation for domain validation
function evalInterval(formula, len) {
  const stack = [];
  for (let i=0; i<len; i++) {
    const op = formula[i];
    if (op < N_STATS) {
      stack.push({ lo: STAT_LO[op], hi: STAT_HI[op] });
    } else if (op === CONST_PH) {
      stack.push({ lo: -50, hi: 50 });
    } else if (isUnop(op)) {
      if (!stack.length) return null;
      const a = stack[stack.length-1]; let r;
      switch(op) {
        case 35: // abs
          r = a.lo>=0 ? a : a.hi<=0 ? {lo:-a.hi,hi:-a.lo} : {lo:0,hi:Math.max(-a.lo,a.hi)};
          break;
        case 36: // sqrt
          if (a.lo < 0) return null;
          r = {lo:Math.sqrt(a.lo),hi:Math.sqrt(a.hi)};
          break;
        case 37: // log10
          if (a.lo <= 0) return null;
          r = {lo:Math.log10(a.lo),hi:Math.log10(a.hi)};
          break;
        case 38: // log2
          if (a.lo <= 0) return null;
          r = {lo:Math.log2(a.lo),hi:Math.log2(a.hi)};
          break;
        default: return null;
      }
      stack[stack.length-1] = r;
    } else if (isBinop(op)) {
      if (stack.length<2) return null;
      const b=stack.pop(), a=stack[stack.length-1]; let r;
      switch(op) {
        case 28: r={lo:a.lo+b.lo,hi:a.hi+b.hi}; break;
        case 29: r={lo:a.lo-b.hi,hi:a.hi-b.lo}; break;
        case 30: { // *
          const p=[a.lo*b.lo,a.lo*b.hi,a.hi*b.lo,a.hi*b.hi];
          r={lo:Math.min(...p),hi:Math.max(...p)}; break;
        }
        case 31: // /
          if (b.lo<=0 && b.hi>=0) return null;
          { let il=1/b.hi,ih=1/b.lo; if(b.lo<0){const t=il;il=ih;ih=t;}
            const p=[a.lo*il,a.lo*ih,a.hi*il,a.hi*ih];
            r={lo:Math.min(...p),hi:Math.max(...p)}; break; }
        case 32: r={lo:Math.max(a.lo,b.lo),hi:Math.max(a.hi,b.hi)}; break;
        case 33: r={lo:Math.min(a.lo,b.lo),hi:Math.min(a.hi,b.hi)}; break;
        case 34: // pow
          if (a.lo<0) return null;
          { const bExp=b.hi>0?b.hi:b.lo;
            const result = Math.pow(a.hi, Math.abs(bExp));
            if (!isFinite(result) || result > 1e6) return null;
            r={lo:Math.pow(a.lo,bExp>0?b.lo:b.hi),hi:result}; break; }
        default: return null;
      }
      stack[stack.length-1]=r;
    }
  }
  if (stack.length!==1) return null;
  const iv=stack[0];
  // Invalid if domain is empty or constant
  if (iv.lo > iv.hi || iv.lo === iv.hi) return null;
  return iv;
}

// Structural pruning — returns true if formula should be skipped
function structuralPrune(formula, pos, sh, ph, startStk, noConst) {
  const op = formula[pos];

  // R12: no-const mode
  if (noConst && op === CONST_PH) return true;

  // R4: commutative dedup on leaf pairs (left <= right)
  if (isBinop(op) && commutes(op) && pos>=2 &&
      isLeaf(formula[pos-2]) && isLeaf(formula[pos-1]) &&
      formula[pos-2] > formula[pos-1]) return true;

  // R5: x-x and x/x for stat leaves
  if ((op===29||op===31) && pos>=2 &&
      isLeaf(formula[pos-2]) && isLeaf(formula[pos-1]) &&
      formula[pos-2]<N_STATS && formula[pos-2]===formula[pos-1]) return true;

  // R6: abs(abs(x))
  if (op===35 && pos>=1 && formula[pos-1]===35) return true;

  // R3: pure-const root child for +/-/*/÷
  if (isBinop(op) && sh===2 && (op===28||op===29||op===30||op===31)) {
    const lp=(ph>>(sh-2))&1, rp=(ph>>(sh-1))&1;
    if (lp||rp) return true;
  }

  // R8: identical subtrees under -/÷/max/min/+
  if ((op===29||op===31||op===32||op===33||op===28) && pos>=2 && sh>=2 && startStk) {
    const startB = startStk[sh-1]; // start of right operand subtree
    const startA = startStk[sh-2]; // start of left  operand subtree
    const endB = pos-1, endA = startB-1;
    if (endA >= startA && endB >= startB &&
        subtreesIdentical(formula, startA, endA, startB, endB)) return true;
  }

  // R9: log2(A)+log2(B) → log2(A*B) (reducible)
  if (op===28 && pos>=4 &&
      formula[pos-1]===38 && formula[pos-2]===38) return true;

  // R9b: log2(A)-log2(B) → log2(A/B)
  if (op===29 && pos>=4 &&
      formula[pos-1]===38 && formula[pos-2]===38) return true;

  // R10: sqrt(A)*sqrt(B) → sqrt(A*B)
  if (op===30 && pos>=4 &&
      formula[pos-1]===36 && formula[pos-2]===36) return true;

  // R11: abs(A)*abs(B) → abs(A*B)
  if (op===30 && pos>=4 &&
      formula[pos-1]===35 && formula[pos-2]===35) return true;

  return false;
}

// ── Main generator ────────────────────────────────────────────────────────────
export function* generateSize(size, ignoredStats=new Set(), maxConsts=2, noConst=false) {
  if (size < 1 || size > 32) return;

  const formula   = new Uint8Array(size);
  const frameNext = new Uint8Array(size);
  const frameH    = new Int8Array(size);
  const frameCC   = new Uint8Array(size);
  const framePH   = new Uint32Array(size);
  // start_stack: for each stack level, start position in formula of that subtree
  const frameStart = Array.from({length: size}, () => new Uint8Array(STACK_SIZE));

  let pos=0, sh=0, cc=0, ph=0, next=0;
  const curStart = new Uint8Array(STACK_SIZE);

  while (true) {
    let placed = false;
    for (let op=next; op<N_OPCODES; op++) {
      if (op < N_STATS && ignoredStats.has(op)) continue;

      let nh = sh;
      if      (isLeaf(op))  { nh++; if (nh>STACK_SIZE) continue; }
      else if (isUnop(op))  { if (sh<1) continue; }
      else                   { if (sh<2) continue; nh--; }
      if (!completable(nh, size-pos-1)) continue;
      if (op===CONST_PH && (noConst||cc>=maxConsts)) continue;

      formula[pos] = op;
      if (structuralPrune(formula, pos, sh, ph, curStart, noConst)) continue;

      if (pos === size-1) {
        if (nh===1 && passesRootRule(formula, size)) {
          if (evalInterval(formula, size) !== null) yield formula;
        }
        continue;
      }

      // Save frame
      const nc  = cc + (op===CONST_PH ? 1 : 0);
      const nph = updatePh(ph, sh, op);
      frameNext[pos] = op+1;
      frameH[pos]    = nh;
      frameCC[pos]   = nc;
      framePH[pos]   = nph;
      frameStart[pos].set(curStart);

      // Update curStart for new stack level
      if (isLeaf(op)) {
        curStart[sh] = pos; // this leaf starts at pos
      } else if (isUnop(op)) {
        // top-of-stack subtree stays (unop wraps it, starts at same position)
        // curStart[sh-1] unchanged
      } else {
        // binop: left subtree starts at curStart[sh-2], result at sh-2 — keep
        // (the merged subtree's start = start of left operand)
      }

      sh=nh; cc=nc; ph=nph; pos++; next=0; placed=true; break;
    }

    if (!placed) {
      if (pos===0) break;
      pos--;
      sh  = pos > 0 ? frameH[pos-1]  : 0;
      cc  = pos > 0 ? frameCC[pos-1] : 0;
      ph  = pos > 0 ? framePH[pos-1] : 0;
      next = frameNext[pos];
      curStart.set(frameStart[pos]);
    }
  }
}

// Generate all sizes from 1 to maxSize
export function* generateAll(maxSize, ignoredStats=new Set(), noConst=false) {
  for (let s=1; s<=maxSize; s++) {
    if (s===2) continue; // size 2 can't produce valid formula (root=binop needs 3 nodes)
    yield* generateSize(s, ignoredStats, 2, noConst);
  }
}
