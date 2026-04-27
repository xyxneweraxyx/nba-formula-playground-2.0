import { useState } from 'react';
import { simulateStack, isBinop, isUnop, isLeaf, isConst, CONST_PLACEHOLDER, STAT_NAMES, N_STATS } from '../engine';

// ── Stat layout for the grid ──────────────────────────────────────────────────
// Situational: single A/B pair (no windows)
const SITUATIONAL = [
  { label:'rest',    a:0,  b:1  },
  { label:'density', a:2,  b:3  },
  { label:'streak',  a:4,  b:5  },
  { label:'W_s',     a:6,  b:7  },
  { label:'elo',     a:14, b:15 },
];
// Performance: 3 windows (season / l3 / l10)
const PERFORMANCE = [
  { label:'ORTG', as:8,  bs:9,  al3:16, bl3:17, al10:22, bl10:23 },
  { label:'DRTG', as:10, bs:11, al3:18, bl3:19, al10:24, bl10:25 },
  { label:'MOV',  as:12, bs:13, al3:20, bl3:21, al10:26, bl10:27 },
];

// Modifier stat options (A stats only, even indices)
const MODIFIER_STATS = [
  { label:'— Aucun —',    value:-1 },
  { label:'rest',          value:0  },
  { label:'density',       value:2  },
  { label:'streak',        value:4  },
  { label:'W_s',           value:6  },
  { label:'ORTG_s',        value:8  },
  { label:'DRTG_s',        value:10 },
  { label:'MOV_s',         value:12 },
  { label:'elo',           value:14 },
  { label:'ORTG_l3',       value:16 },
  { label:'DRTG_l3',       value:18 },
  { label:'MOV_l3',        value:20 },
  { label:'ORTG_l10',      value:22 },
  { label:'DRTG_l10',      value:24 },
  { label:'MOV_l10',       value:26 },
];

// V3 known formulas
const KNOWN_FORMULAS = [
  { label:'A_elo − B_elo',                              score:'~65%', ops:[14,15,29] },
  { label:'A_elo − B_elo − A_DRTG_l3',                 score:'67.35%', ops:[14,15,29,18,29] },
  { label:'A_elo − B_elo + A_MOV_l10',                 score:'67.28%', ops:[14,15,29,26,28] },
  { label:'A_elo + log2(A_rest²) × B_MOV_s − B_elo',  score:'~72%',   ops:[14,0,0,30,38,13,30,28,15,29] },
];

function canPress(op, stackHeight, opcodes) {
  if (op === CONST_PLACEHOLDER) {
    return stackHeight < 16 && opcodes.filter(isConst).length < 2;
  }
  if (isLeaf(op))  return stackHeight < 16;
  if (isUnop(op))  return stackHeight >= 1;
  if (isBinop(op)) return stackHeight >= 2;
  return false;
}

const COLORS = {
  AS: { bg:'#0c1f3a', bgH:'#132b50', text:'#60a5fa', border:'#1d3a6e' }, // A season
  AL: { bg:'#091730', bgH:'#0f2440', text:'#93c5fd', border:'#163560' }, // A last
  BS: { bg:'#2a1400', bgH:'#3d1e00', text:'#fb923c', border:'#5a2e00' }, // B season
  BL: { bg:'#221200', bgH:'#331a00', text:'#fbbf24', border:'#4a2a00' }, // B last
};

function StatBtn({ label, opcode, colorSet, enabled, onPress }) {
  const [hover, setHover] = useState(false);
  return (
    <button
      disabled={!enabled}
      onClick={() => onPress(opcode)}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        background: !enabled ? '#0d1117' : hover ? colorSet.bgH : colorSet.bg,
        border: `1px solid ${enabled ? colorSet.border : '#21262d'}`,
        color: enabled ? colorSet.text : '#30363d',
        padding:'4px 2px', borderRadius:5, fontSize:10, fontWeight:500,
        cursor: enabled ? 'pointer' : 'default',
        fontFamily:"'JetBrains Mono', monospace",
        transition:'background .1s', whiteSpace:'nowrap', textAlign:'center',
      }}
    >{label}</button>
  );
}

function OpBtn({ label, opcode, enabled, onPress }) {
  const [hover, setHover] = useState(false);
  return (
    <button
      disabled={!enabled}
      onClick={() => onPress(opcode)}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        background: !enabled ? '#0d1117' : hover ? '#252d3d' : '#1c2130',
        border: `1px solid ${enabled ? '#30363d' : '#21262d'}`,
        color: enabled ? '#e6edf3' : '#30363d',
        padding:'6px 10px', borderRadius:6, fontSize:13, fontWeight:500,
        cursor: enabled ? 'pointer' : 'default',
        fontFamily:"'JetBrains Mono', monospace",
        transition:'background .1s',
      }}
    >{label}</button>
  );
}

export default function Calculator({
  opcodes, stackHeight, isComplete, partialStack, results, nPh,
  onPush, onUndo, onClear, onLoad,
  threshModStat, quantileMode,
}) {
  const [importText, setImportText] = useState('');
  const [importError, setImportError] = useState('');

  const score     = results?.score;
  const threshold = results?.threshold;
  const consts    = results?.consts ?? [];
  const bucketThresholds = results?.bucketThresholds;
  const bucketBoundaries = results?.bucketBoundaries;
  const bucketCounts = results?.bucketCounts;

  const BASELINE  = 0.6426;
  const BREAKEVEN = 1/1.87;

  const scoreColor = s => {
    if (s == null) return '#8b949e';
    if (s > 0.70) return '#22c55e';
    if (s > 0.68) return '#3fb950';
    if (s > 0.66) return '#56d364';
    if (s > 0.64) return '#f59e0b';
    if (s > 0.60) return '#d29922';
    return '#f85149';
  };

  const handleImport = () => {
    setImportError('');
    try {
      const text = importText.trim();
      // Try parsing as plain array or JSON object
      let ops;
      if (text.startsWith('[')) {
        ops = JSON.parse(text);
      } else {
        const obj = JSON.parse(text);
        ops = obj.opcodes ?? obj;
      }
      if (!Array.isArray(ops)) throw new Error('Attendu un tableau');
      const arr = ops.map(Number);
      if (arr.some(isNaN)) throw new Error('Valeurs non numériques');
      // Validate
      if (simulateStack(arr) !== 1) throw new Error('Formule invalide (stack height ≠ 1)');
      onLoad(arr);
      setImportText('');
    } catch(e) {
      setImportError(e.message);
    }
  };

  // Bucket threshold display
  const BUCKET_LABELS = ['≤−3','=−2','=−1','= 0','=+1','=+2','≥+3'];

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:14 }}>

      {/* ── Import from bruteforcer ── */}
      <div style={{ background:'#0d1117', border:'1px solid #21262d', borderRadius:10, padding:'14px 18px' }}>
        <div style={{ fontSize:11, color:'#484f58', fontWeight:600, letterSpacing:2, textTransform:'uppercase', marginBottom:10 }}>
          Importer depuis le bruteforcer
        </div>
        <div style={{ fontSize:11, color:'#8b949e', marginBottom:8 }}>
          Colle les opcodes depuis le terminal :
        </div>
        <div style={{ display:'flex', gap:8, marginBottom:importError?6:0 }}>
          <input
            value={importText}
            onChange={e => { setImportText(e.target.value); setImportError(''); }}
            placeholder="[14, 15, 29, 26, 28]"
            onKeyDown={e => e.key==='Enter' && handleImport()}
            style={{
              flex:1, padding:'8px 12px', borderRadius:6, fontSize:12,
              background:'#161b22', border:'1px solid #30363d', color:'#e6edf3',
              fontFamily:"'JetBrains Mono', monospace",
            }}
          />
          <button onClick={handleImport} style={{
            padding:'8px 14px', borderRadius:6, fontSize:12, fontWeight:600,
            background:'#132b50', border:'1px solid #60a5fa', color:'#60a5fa', cursor:'pointer',
          }}>Charger</button>
        </div>
        {importError && <div style={{ fontSize:11, color:'#f85149' }}>⚠ {importError}</div>}
      </div>

      {/* ── Threshold modifier config ── */}
      <div style={{ background:'#0d1117', border:'1px solid #21262d', borderRadius:10, padding:'14px 18px' }}>
        <div style={{ fontSize:11, color:'#484f58', fontWeight:600, letterSpacing:2, textTransform:'uppercase', marginBottom:10 }}>
          Threshold modifier (optionnel)
        </div>
        <div style={{ fontSize:11, color:'#8b949e', marginBottom:8 }}>
          Stat pour bucketer le threshold (A_stat − B_stat)
        </div>
        <div style={{ display:'flex', gap:8, alignItems:'center', marginBottom:8 }}>
          <select
            value={threshModStat}
            readOnly
            disabled
            style={{
              flex:1, padding:'7px 10px', borderRadius:6, fontSize:12,
              background:'#161b22', border:'1px solid #30363d', color:'#8b949e',
            }}
          >
            {MODIFIER_STATS.map(s => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </select>
        </div>
        <div style={{ fontSize:10, color:'#484f58' }}>
          Configure dans la sidebar → le threshold modifier s'applique à toutes les pages.
          {threshModStat >= 0 && (
            <span style={{ color:'#f59e0b', marginLeft:6 }}>
              Actif : {STAT_NAMES[threshModStat]} − {STAT_NAMES[threshModStat+1]}
              {quantileMode ? ' (quantile)' : ' (entier)'}
            </span>
          )}
        </div>
      </div>

      {/* ── Formula display + score ── */}
      <div style={{ background:'#0d1117', border:'1px solid #21262d', borderRadius:10, padding:'14px 18px' }}>
        <div style={{ fontSize:11, color:'#484f58', fontWeight:600, letterSpacing:2, textTransform:'uppercase', marginBottom:8 }}>
          Formule courante
        </div>
        <div style={{ minHeight:48, marginBottom:10 }}>
          {partialStack.length === 0 ? (
            <div style={{ color:'#484f58', fontFamily:"'JetBrains Mono', monospace", fontSize:13, fontStyle:'italic' }}>
              Construis ou importe une formule…
            </div>
          ) : (
            <div style={{ display:'flex', flexDirection:'column', gap:4 }}>
              {partialStack.map((expr, i) => (
                <div key={i} style={{ display:'flex', alignItems:'center', gap:8 }}>
                  <span style={{ fontSize:10, color:'#484f58', fontFamily:'monospace', width:20 }}>[{i}]</span>
                  <span style={{
                    fontFamily:"'JetBrains Mono', monospace", fontSize:12,
                    color: i===partialStack.length-1 ? '#e6edf3' : '#8b949e',
                    background:'#161b22', borderRadius:4, padding:'3px 8px',
                  }}>{expr}</span>
                  {i===partialStack.length-1 && <span style={{ fontSize:10, color:'#f59e0b' }}>← top</span>}
                </div>
              ))}
            </div>
          )}
        </div>

        <div style={{ borderTop:'1px solid #21262d', paddingTop:10 }}>
          <div style={{ display:'flex', alignItems:'baseline', gap:12, flexWrap:'wrap', marginBottom:6 }}>
            <span style={{ fontSize:28, fontWeight:700, color:scoreColor(score), fontFamily:"'JetBrains Mono', monospace" }}>
              {score != null ? `${(score*100).toFixed(2)}%` : isComplete ? '…' : '—'}
            </span>
            {score != null && (
              <span style={{ fontSize:12, color:score>BASELINE?'#3fb950':'#f85149' }}>
                {score>BASELINE?'+':''}{((score-BASELINE)*100).toFixed(2)}% vs baseline
              </span>
            )}
          </div>

          {/* Simple threshold */}
          {threshModStat < 0 && threshold != null && (
            <div style={{ fontSize:11, color:'#484f58', fontFamily:'monospace', marginBottom:4 }}>
              thr = {threshold>0?'+':''}{threshold.toFixed(4)}
              {consts.length > 0 && (
                <span style={{ marginLeft:12 }}>
                  {consts.map((c,i) => `c${i+1}=${c}`).join('  ')}
                </span>
              )}
            </div>
          )}

          {/* Bucket thresholds */}
          {threshModStat >= 0 && bucketThresholds && (
            <div style={{ marginTop:8 }}>
              <div style={{ fontSize:10, color:'#484f58', marginBottom:6 }}>
                Thresholds par bucket ({STAT_NAMES[threshModStat]} − {STAT_NAMES[threshModStat+1]}) :
              </div>
              <div style={{ display:'grid', gridTemplateColumns:'repeat(7,1fr)', gap:3 }}>
                {bucketThresholds.map((t, b) => {
                  const label = quantileMode && bucketBoundaries && bucketBoundaries[b] !== 0
                    ? `Q${b+1}`
                    : BUCKET_LABELS[b];
                  return (
                    <div key={b} style={{ background:'#161b22', borderRadius:4, padding:'4px', textAlign:'center' }}>
                      <div style={{ fontSize:9, color:'#484f58', marginBottom:2 }}>{label}</div>
                      <div style={{ fontSize:10, color:'#f59e0b', fontFamily:'monospace' }}>{t.toFixed(1)}</div>
                      <div style={{ fontSize:9, color:'#30363d' }}>n={bucketCounts?.[b]??0}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div style={{ fontSize:11, color:score!=null&&score>=BREAKEVEN?'#3fb950':'#f85149', marginTop:6 }}>
            {score!=null ? (score>=BREAKEVEN?'✓':'✗') : ''} break-even Winamax (53.48%)
          </div>
        </div>
      </div>

      {/* ── Stat grid ── */}
      <div style={{ background:'#0d1117', border:'1px solid #21262d', borderRadius:10, padding:'14px 18px' }}>
        <div style={{ fontSize:11, color:'#484f58', fontWeight:600, letterSpacing:2, textTransform:'uppercase', marginBottom:12 }}>
          Statistiques situationnelles
        </div>
        {/* Header */}
        <div style={{ display:'grid', gridTemplateColumns:'60px 1fr 1fr', gap:4, marginBottom:6 }}>
          <div/>
          <div style={{ textAlign:'center', fontSize:10, color:'#60a5fa', fontWeight:600 }}>A (home)</div>
          <div style={{ textAlign:'center', fontSize:10, color:'#fb923c', fontWeight:600 }}>B (away)</div>
        </div>
        {SITUATIONAL.map(({label,a,b}) => (
          <div key={label} style={{ display:'grid', gridTemplateColumns:'60px 1fr 1fr', gap:4, marginBottom:4 }}>
            <div style={{ display:'flex', alignItems:'center', fontSize:11, color:'#8b949e', fontFamily:"'JetBrains Mono', monospace" }}>{label}</div>
            <StatBtn label={label} opcode={a} colorSet={COLORS.AS} enabled={canPress(a,stackHeight,opcodes)} onPress={onPush} />
            <StatBtn label={label} opcode={b} colorSet={COLORS.BS} enabled={canPress(b,stackHeight,opcodes)} onPress={onPush} />
          </div>
        ))}

        <div style={{ fontSize:11, color:'#484f58', fontWeight:600, letterSpacing:2, textTransform:'uppercase', marginTop:14, marginBottom:8 }}>
          Performance (saison / l3 / l10)
        </div>
        {/* Performance header */}
        <div style={{ display:'grid', gridTemplateColumns:'40px repeat(3,1fr) repeat(3,1fr)', gap:3, marginBottom:5 }}>
          <div/>
          <div style={{ textAlign:'center', fontSize:9, color:'#60a5fa' }}>A_s</div>
          <div style={{ textAlign:'center', fontSize:9, color:'#60a5fa', opacity:0.7 }}>A_l3</div>
          <div style={{ textAlign:'center', fontSize:9, color:'#60a5fa', opacity:0.5 }}>A_l10</div>
          <div style={{ textAlign:'center', fontSize:9, color:'#fb923c' }}>B_s</div>
          <div style={{ textAlign:'center', fontSize:9, color:'#fb923c', opacity:0.7 }}>B_l3</div>
          <div style={{ textAlign:'center', fontSize:9, color:'#fb923c', opacity:0.5 }}>B_l10</div>
        </div>
        {PERFORMANCE.map(({label,as:as_,bs,al3,bl3,al10,bl10}) => (
          <div key={label} style={{ display:'grid', gridTemplateColumns:'40px repeat(3,1fr) repeat(3,1fr)', gap:3, marginBottom:4 }}>
            <div style={{ display:'flex', alignItems:'center', fontSize:10, color:'#8b949e', fontFamily:"'JetBrains Mono', monospace" }}>{label}</div>
            <StatBtn label={label} opcode={as_}  colorSet={COLORS.AS} enabled={canPress(as_,stackHeight,opcodes)}  onPress={onPush} />
            <StatBtn label={label} opcode={al3}  colorSet={{...COLORS.AL,text:'#93c5fd'}} enabled={canPress(al3,stackHeight,opcodes)}  onPress={onPush} />
            <StatBtn label={label} opcode={al10} colorSet={{...COLORS.AL,text:'#bfdbfe'}} enabled={canPress(al10,stackHeight,opcodes)} onPress={onPush} />
            <StatBtn label={label} opcode={bs}   colorSet={COLORS.BS} enabled={canPress(bs,stackHeight,opcodes)}   onPress={onPush} />
            <StatBtn label={label} opcode={bl3}  colorSet={{...COLORS.BL,text:'#fcd34d'}} enabled={canPress(bl3,stackHeight,opcodes)}  onPress={onPush} />
            <StatBtn label={label} opcode={bl10} colorSet={{...COLORS.BL,text:'#fef08a'}} enabled={canPress(bl10,stackHeight,opcodes)} onPress={onPush} />
          </div>
        ))}
      </div>

      {/* ── Operators ── */}
      <div style={{ background:'#0d1117', border:'1px solid #21262d', borderRadius:10, padding:'14px 18px' }}>
        <div style={{ fontSize:11, color:'#484f58', fontWeight:600, letterSpacing:2, textTransform:'uppercase', marginBottom:10 }}>
          Opérateurs
        </div>
        <div style={{ marginBottom:8 }}>
          <div style={{ fontSize:11, color:'#484f58', marginBottom:6 }}>Binaires</div>
          <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
            {[['+',28],['−',29],['×',30],['÷',31],['max',32],['min',33],['pow',34]].map(([l,op])=>(
              <OpBtn key={op} label={l} opcode={op} enabled={canPress(op,stackHeight,opcodes)} onPress={onPush} />
            ))}
          </div>
        </div>
        <div style={{ marginBottom:8 }}>
          <div style={{ fontSize:11, color:'#484f58', marginBottom:6 }}>Unaires</div>
          <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
            {[['abs',35],['sqrt',36],['log10',37],['log2',38]].map(([l,op])=>(
              <OpBtn key={op} label={l} opcode={op} enabled={canPress(op,stackHeight,opcodes)} onPress={onPush} />
            ))}
          </div>
        </div>
        <div>
          <div style={{ fontSize:11, color:'#484f58', marginBottom:6 }}>Constante (auto-optimisée, max 2)</div>
          <OpBtn label="? constante" opcode={CONST_PLACEHOLDER}
            enabled={canPress(CONST_PLACEHOLDER,stackHeight,opcodes)}
            onPress={onPush} />
        </div>
      </div>

      {/* ── Controls ── */}
      <div style={{ display:'flex', gap:8 }}>
        <button onClick={onUndo} disabled={!opcodes.length} style={{
          flex:1, padding:10, borderRadius:8,
          background:opcodes.length?'#161b22':'#0d1117',
          border:`1px solid ${opcodes.length?'#30363d':'#21262d'}`,
          color:opcodes.length?'#8b949e':'#30363d', fontSize:13,
          cursor:opcodes.length?'pointer':'default',
        }}>← Annuler</button>
        <button onClick={onClear} disabled={!opcodes.length} style={{
          flex:1, padding:10, borderRadius:8,
          background:opcodes.length?'#1a0000':'#0d1117',
          border:`1px solid ${opcodes.length?'#5a1a1a':'#21262d'}`,
          color:opcodes.length?'#f85149':'#30363d', fontSize:13,
          cursor:opcodes.length?'pointer':'default',
        }}>✕ Effacer</button>
      </div>

      {/* ── Known formulas ── */}
      <div style={{ background:'#0d1117', border:'1px solid #21262d', borderRadius:10, padding:'14px 18px' }}>
        <div style={{ fontSize:11, color:'#484f58', fontWeight:600, letterSpacing:2, textTransform:'uppercase', marginBottom:10 }}>
          Formules V3 connues
        </div>
        {KNOWN_FORMULAS.map(({label,score:s,ops})=>(
          <button key={label} onClick={()=>{onClear();ops.forEach(op=>onPush(op));}} style={{
            width:'100%', background:'none', border:'1px solid #21262d', borderRadius:6,
            padding:'8px 12px', marginBottom:5, cursor:'pointer', textAlign:'left',
            display:'flex', justifyContent:'space-between', alignItems:'center',
          }}
          onMouseEnter={e=>e.currentTarget.style.borderColor='#30363d'}
          onMouseLeave={e=>e.currentTarget.style.borderColor='#21262d'}>
            <span style={{ fontSize:11, color:'#8b949e', fontFamily:"'JetBrains Mono', monospace" }}>{label}</span>
            <span style={{ fontSize:11, color:'#3fb950', fontWeight:600, flexShrink:0, marginLeft:8 }}>{s}</span>
          </button>
        ))}
      </div>

    </div>
  );
}
