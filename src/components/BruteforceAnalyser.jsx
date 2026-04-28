import { useState, useRef, useCallback, useEffect } from 'react';
import { STAT_NAMES, OP_NAMES } from '../engine';
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip,
  CartesianGrid, Cell, ReferenceLine,
} from 'recharts';


function ExportBtn({ data, filename, label='↓ Export JSON' }) {
  const handle = () => {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type:'application/json' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
  };
  return (
    <button onClick={handle} style={{
      padding:'7px 14px', borderRadius:6, fontSize:12, fontWeight:600, cursor:'pointer',
      background:'#0f2d10', border:'1px solid #3fb950', color:'#3fb950',
    }}>{label}</button>
  );
}
const BASELINE  = 0.6426;
const TOOLTIP_S = { background:'#161b22', border:'1px solid #30363d', borderRadius:8, fontSize:12, color:'#e6edf3' };
const pct = (v, d=2) => v==null||v===0 ? '—' : `${(v*100).toFixed(d)}%`;
const scoreColor = v => {
  if (!v) return '#484f58';
  if (v > 0.70) return '#22c55e';
  if (v > 0.68) return '#3fb950';
  if (v > 0.66) return '#56d364';
  if (v > 0.64) return '#f59e0b';
  if (v > 0.60) return '#d29922';
  return '#8b949e';
};

// V3 stat groups for the ignore panel
const STAT_GROUPS = [
  { label:'Situationnel A',  indices:[0, 2, 4, 6, 14] },
  { label:'Situationnel B',  indices:[1, 3, 5, 7, 15] },
  { label:'Perf A (saison)', indices:[8, 10, 12] },
  { label:'Perf B (saison)', indices:[9, 11, 13] },
  { label:'Perf A (l3)',     indices:[16, 18, 20] },
  { label:'Perf B (l3)',     indices:[17, 19, 21] },
  { label:'Perf A (l10)',    indices:[22, 24, 26] },
  { label:'Perf B (l10)',    indices:[23, 25, 27] },
];

function ConfigPanel({ config, onChange, onStart, onStop, running }) {
  const { maxSize, ignoredStats, noConst } = config;

  const toggleStat = idx => {
    const next = new Set(ignoredStats);
    if (next.has(idx)) next.delete(idx); else next.add(idx);
    onChange({ ...config, ignoredStats: next });
  };

  const toggleGroup = indices => {
    const allIgnored = indices.every(i => ignoredStats.has(i));
    const next = new Set(ignoredStats);
    indices.forEach(i => allIgnored ? next.delete(i) : next.add(i));
    onChange({ ...config, ignoredStats: next });
  };

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
      {/* Taille */}
      <div style={{ background:'#0d1117', border:'1px solid #21262d', borderRadius:10, padding:'14px 18px' }}>
        <div style={{ fontSize:11, color:'#484f58', fontWeight:600, letterSpacing:2, textTransform:'uppercase', marginBottom:12 }}>
          Taille maximale
        </div>
        <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
          {[1,3,4,5,6].map(s => (
            <button key={s} onClick={() => onChange({...config, maxSize:s})}
              disabled={running}
              style={{
                padding:'8px 14px', borderRadius:6, fontSize:13, fontWeight:600,
                cursor:running?'default':'pointer',
                background: maxSize===s ? '#132b50' : '#0d1117',
                border: `1px solid ${maxSize===s?'#60a5fa':'#21262d'}`,
                color: maxSize===s ? '#60a5fa' : '#484f58',
              }}>
              size {s}
            </button>
          ))}
        </div>
        <div style={{ fontSize:11, color:'#484f58', marginTop:8 }}>
          {maxSize<=3?'~formules de base':maxSize===4?'~quelques milliers':maxSize===5?'~1M+ formules':maxSize===6?'~50M+':'-'}
          {maxSize>=5 && <span style={{ color:'#f59e0b', marginLeft:8 }}>⚠ peut prendre plusieurs minutes</span>}
        </div>
      </div>

      {/* Options */}
      <div style={{ background:'#0d1117', border:'1px solid #21262d', borderRadius:10, padding:'14px 18px' }}>
        <div style={{ fontSize:11, color:'#484f58', fontWeight:600, letterSpacing:2, textTransform:'uppercase', marginBottom:10 }}>
          Options
        </div>
        <button
          onClick={() => onChange({...config, noConst:!noConst})}
          disabled={running}
          style={{
            padding:'7px 14px', borderRadius:6, fontSize:12, fontWeight:600,
            cursor:running?'default':'pointer',
            background: noConst?'#132b50':'#0d1117',
            border:`1px solid ${noConst?'#60a5fa':'#21262d'}`,
            color:noConst?'#60a5fa':'#484f58',
          }}
        >
          {noConst ? '✓ Sans constantes' : '○ Sans constantes'}
        </button>
        <div style={{ fontSize:11, color:'#484f58', marginTop:6 }}>
          Désactive CONST_PLACEHOLDER — espace de recherche réduit, plus rapide
        </div>
      </div>

      {/* Stats à ignorer */}
      <div style={{ background:'#0d1117', border:'1px solid #21262d', borderRadius:10, padding:'14px 18px' }}>
        <div style={{ fontSize:11, color:'#484f58', fontWeight:600, letterSpacing:2, textTransform:'uppercase', marginBottom:12 }}>
          Stats à ignorer
        </div>
        {STAT_GROUPS.map(({ label, indices }) => (
          <div key={label} style={{ marginBottom:10 }}>
            <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:5 }}>
              <button onClick={() => toggleGroup(indices)} disabled={running}
                style={{ fontSize:10, color:'#8b949e', background:'none', border:'none', cursor:running?'default':'pointer', padding:0 }}>
                {indices.every(i=>ignoredStats.has(i)) ? '☑ ignorer' : '☐ inclure'}
              </button>
              <span style={{ fontSize:11, color:'#484f58', fontWeight:600 }}>{label}</span>
            </div>
            <div style={{ display:'flex', gap:4, flexWrap:'wrap' }}>
              {indices.map(idx => {
                const ignored = ignoredStats.has(idx);
                return (
                  <button key={idx} onClick={() => toggleStat(idx)} disabled={running}
                    style={{
                      padding:'3px 8px', borderRadius:4, fontSize:10,
                      background:ignored?'#1a0000':'#0d1117',
                      border:`1px solid ${ignored?'#5a1a1a':'#30363d'}`,
                      color:ignored?'#484f58':'#8b949e',
                      cursor:running?'default':'pointer',
                      textDecoration:ignored?'line-through':'none',
                      fontFamily:"'JetBrains Mono', monospace",
                    }}>
                    {STAT_NAMES[idx]}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
        {ignoredStats.size > 0 && (
          <div style={{ fontSize:11, color:'#f59e0b', marginTop:4 }}>
            {ignoredStats.size} stat(s) ignorée(s)
          </div>
        )}
      </div>

      {/* Boutons */}
      <div style={{ display:'flex', gap:8 }}>
        <button onClick={onStart} disabled={running} style={{
          flex:1, padding:'12px', borderRadius:8, fontSize:14, fontWeight:600,
          background:running?'#0d1117':'#0f2d10',
          border:`1px solid ${running?'#21262d':'#3fb950'}`,
          color:running?'#484f58':'#3fb950',
          cursor:running?'default':'pointer',
        }}>
          {running ? '⏳ Analyse en cours…' : '▶ Lancer l\'analyse'}
        </button>
        {running && (
          <button onClick={onStop} style={{
            padding:'12px 20px', borderRadius:8, fontSize:14, fontWeight:600,
            background:'#1a0000', border:'1px solid #f85149', color:'#f85149', cursor:'pointer',
          }}>■ Stop</button>
        )}
      </div>
    </div>
  );
}

function StatTable({ data, title }) {
  const sorted = [...data].filter(d=>d.appearances>0).sort((a,b)=>(b.top10||0)-(a.top10||0));
  if (!sorted.length) return null;
  const cols = ['top1','top10','top25','mean','max'];
  const colLabels = { top1:'Top 1%', top10:'Top 10%', top25:'Top 25%', mean:'Moyenne', max:'Max' };
  return (
    <div style={{ background:'#0d1117', border:'1px solid #21262d', borderRadius:10, padding:'14px 18px' }}>
      <div style={{ fontSize:11, color:'#484f58', fontWeight:600, letterSpacing:2, textTransform:'uppercase', marginBottom:12 }}>{title}</div>
      <div style={{ overflowX:'auto' }}>
        <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
          <thead>
            <tr>
              <th style={{ textAlign:'left', color:'#8b949e', padding:'4px 8px', fontWeight:600 }}>Nom</th>
              <th style={{ textAlign:'right', color:'#484f58', padding:'4px 8px' }}>App.</th>
              {cols.map(c=><th key={c} style={{ textAlign:'right', color:'#484f58', padding:'4px 8px' }}>{colLabels[c]}</th>)}
            </tr>
          </thead>
          <tbody>
            {sorted.map((d,i)=>(
              <tr key={d.name} style={{ borderTop:'1px solid #161b22', background:i%2===0?'transparent':'#0a0e18' }}>
                <td style={{ padding:'5px 8px', fontFamily:"'JetBrains Mono', monospace", color:'#e6edf3', fontSize:11 }}>{d.name}</td>
                <td style={{ padding:'5px 8px', textAlign:'right', color:'#484f58' }}>{d.appearances.toLocaleString('fr-FR')}</td>
                {cols.map(c=>(
                  <td key={c} style={{ padding:'5px 8px', textAlign:'right', color:scoreColor(d[c]), fontFamily:'monospace', fontWeight:600 }}>
                    {pct(d[c])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function SizeTable({ data }) {
  if (!data.length) return null;
  return (
    <div style={{ background:'#0d1117', border:'1px solid #21262d', borderRadius:10, padding:'14px 18px' }}>
      <div style={{ fontSize:11, color:'#484f58', fontWeight:600, letterSpacing:2, textTransform:'uppercase', marginBottom:12 }}>Par Taille</div>
      <div style={{ display:'grid', gridTemplateColumns:`repeat(${data.length},1fr)`, gap:8 }}>
        {data.map(d=>(
          <div key={d.size} style={{ background:'#161b22', borderRadius:8, padding:'12px', textAlign:'center' }}>
            <div style={{ fontSize:11, color:'#484f58', marginBottom:4 }}>size {d.size}</div>
            <div style={{ fontSize:22, fontWeight:700, color:scoreColor(d.best), fontFamily:'monospace' }}>{pct(d.best)}</div>
            <div style={{ fontSize:11, color:'#8b949e', marginTop:4 }}>{pct(d.mean)} moy.</div>
            <div style={{ fontSize:11, color:'#484f58', marginTop:4 }}>{d.count.toLocaleString('fr-FR')}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function DistributionChart({ data }) {
  const chartData = data.map((count,i)=>({ score:`${(45+i).toFixed(0)}%`, count, pctVal:(45+i)/100 }));
  return (
    <div style={{ background:'#0d1117', border:'1px solid #21262d', borderRadius:10, padding:'14px 18px' }}>
      <div style={{ fontSize:11, color:'#484f58', fontWeight:600, letterSpacing:2, textTransform:'uppercase', marginBottom:12 }}>Distribution des Scores</div>
      <ResponsiveContainer width="100%" height={180}>
        <BarChart data={chartData} margin={{ top:5, right:10, left:-10, bottom:5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#21262d" />
          <XAxis dataKey="score" tick={{ fontSize:10, fill:'#8b949e' }} interval={4} />
          <YAxis tick={{ fontSize:11, fill:'#8b949e' }} />
          <Tooltip contentStyle={TOOLTIP_S} formatter={(v,_,p)=>[`${v} formules`, p.payload.score]} />
          <ReferenceLine x={`${Math.round(BASELINE*100)}%`} stroke="#484f58" strokeDasharray="4 2" />
          <Bar dataKey="count" radius={[2,2,0,0]}>
            {chartData.map((d,i)=><Cell key={i} fill={scoreColor(d.pctVal)} />)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function TopFormulas({ formulas, onLoad }) {
  if (!formulas.length) return null;
  return (
    <div style={{ background:'#0d1117', border:'1px solid #21262d', borderRadius:10, padding:'14px 18px' }}>
      <div style={{ fontSize:11, color:'#484f58', fontWeight:600, letterSpacing:2, textTransform:'uppercase', marginBottom:12 }}>
        Top {formulas.length} — Cliquer pour charger dans le Playground
      </div>
      <div style={{ display:'flex', flexDirection:'column', gap:4 }}>
        {formulas.map(({ opcodes, score, str }, i) => (
          <button key={i} onClick={() => onLoad(opcodes)}
            style={{
              background:'none', border:'1px solid #21262d', borderRadius:6,
              padding:'8px 12px', cursor:'pointer', textAlign:'left',
              display:'flex', justifyContent:'space-between', alignItems:'center',
            }}
            onMouseEnter={e=>e.currentTarget.style.borderColor='#30363d'}
            onMouseLeave={e=>e.currentTarget.style.borderColor='#21262d'}>
            <div style={{ display:'flex', alignItems:'center', gap:10 }}>
              <span style={{ fontSize:11, color:'#484f58', fontFamily:'monospace', width:24 }}>#{i+1}</span>
              <span style={{ fontSize:12, color:'#8b949e', fontFamily:"'JetBrains Mono', monospace" }}>{str}</span>
            </div>
            <span style={{ fontSize:13, fontWeight:700, color:scoreColor(score), fontFamily:'monospace', flexShrink:0, marginLeft:12 }}>
              {pct(score)}
            </span>
          </button>
        ))}
      </div>
      <div style={{ fontSize:11, color:'#484f58', marginTop:8 }}>
        ⚠ Scores approximatifs (threshold=0, consts=0). Charger pour le score réel avec optimisation.
      </div>
    </div>
  );
}

export default function BruteforceAnalyser({ matches, onLoadFormula }) {
  const [config, setConfig]   = useState({ maxSize:4, ignoredStats:new Set(), noConst:false });
  const [running, setRunning] = useState(false);
  const [stats,   setStats]   = useState(null);
  const workerRef = useRef(null);

  const handleStart = useCallback(() => {
    if (workerRef.current) workerRef.current.terminate();
    const worker = new Worker(
      new URL('../bruteforcer.worker.js', import.meta.url),
      { type:'module' }
    );
    workerRef.current = worker;
    worker.onmessage = e => {
      if (e.data.type==='update') setStats(e.data.stats);
      if (e.data.type==='done') { setStats(e.data.stats); setRunning(false); }
    };
    setRunning(true); setStats(null);
    worker.postMessage({
      type: 'start',
      maxSize: config.maxSize,
      ignoredStats: [...config.ignoredStats],
      noConst: config.noConst,
      matches,
    });
  }, [config, matches]);

  const handleStop = useCallback(() => {
    if (workerRef.current) workerRef.current.postMessage({ type:'stop' });
  }, []);

  useEffect(() => () => workerRef.current?.terminate(), []);

  return (
    <div style={{ display:'flex', height:'100%' }}>
      <div style={{ width:320, minWidth:320, borderRight:'1px solid #21262d', overflowY:'auto', padding:'20px 18px' }}>
        <div style={{ marginBottom:16 }}>
          <div style={{ fontSize:18, fontWeight:700, color:'#e6edf3', marginBottom:2 }}>Bruteforcing Analyser</div>
          <div style={{ fontSize:12, color:'#484f58' }}>
            {matches.length} matchs · V3 (28 stats, N_OPCODES=40)
          </div>
        </div>
        <ConfigPanel config={config} onChange={setConfig} onStart={handleStart} onStop={handleStop} running={running} />
      </div>
      <div style={{ flex:1, overflowY:'auto', padding:'20px 24px' }}>
        {!stats ? (
          <div style={{ color:'#484f58', textAlign:'center', padding:'60px 20px', fontSize:14 }}>
            Configure les paramètres et lance l'analyse.
          </div>
        ) : (
          <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
            <div style={{ background:'#0d1117', border:'1px solid #21262d', borderRadius:10, padding:'14px 18px' }}>
              <div style={{ display:'flex', justifyContent:'space-between' }}>
                <span style={{ fontSize:11, color:'#484f58', fontWeight:600, letterSpacing:2, textTransform:'uppercase' }}>Formules analysées</span>
                <span style={{ fontSize:20, fontWeight:700, color:'#e6edf3', fontFamily:"'JetBrains Mono', monospace" }}>
                  {stats.processed.toLocaleString('fr-FR')}
                </span>
              </div>
            </div>
            <div style={{ display:'flex', justifyContent:'flex-end' }}>
              <ExportBtn data={stats} filename="bruteforce_analysis.json" label="↓ Export JSON (Bruteforce)" />
            </div>
            <SizeTable data={stats.bySize} />
            <DistributionChart data={stats.distribution} />
            <StatTable data={stats.byStat} title="Performance par Statistique" />
            <StatTable data={stats.byOp}   title="Performance par Opérateur" />
            <TopFormulas formulas={stats.topFormulas} onLoad={onLoadFormula} />
          </div>
        )}
      </div>
    </div>
  );
}
