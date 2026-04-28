import { useState, useMemo, useCallback, useEffect } from 'react';
import { formulaToStr } from '../engine';
import { computeEdgeAnalysis, analyseSegment, bookLabel, SHARP_BOOKS } from '../hooks/useBetting';
import useFormula from '../hooks/useFormula';
import Calculator from './Calculator';
import { MATCH_TYPES, CATEGORIES, CAT_COLORS } from '../data/matchTypes';
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis,
  Tooltip, CartesianGrid, ReferenceLine, Cell,
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
const pct  = (v, d=2) => v==null ? '—' : `${(v*100).toFixed(d)}%`;
const sign = v => v>=0?'+':'';
const MIN_N = 50;

const edgeColor = v => {
  if (v==null) return '#484f58';
  if (v>0.05) return '#3fb950'; if (v>0.03) return '#56d364';
  if (v>0.01) return '#f59e0b'; if (v>-0.01) return '#8b949e';
  if (v>-0.03) return '#d29922'; return '#f85149';
};
const TOOLTIP_S = { background:'#161b22', border:'1px solid #30363d', borderRadius:8, fontSize:12, color:'#e6edf3' };

function TypeCard({ type, result, onClick, selected }) {
  if (!result) return null;
  const { n, winRate, medianEdge, bestBook } = result;
  const small = n<MIN_N;
  const catColor = CAT_COLORS[type.category]||'#8b949e';
  return (
    <div onClick={() => onClick(type.id)}
      style={{
        background:selected?'#0f2a18':'#0d1117',
        border:`1px solid ${selected?'#3fb950':small?'#5a2e00':'#21262d'}`,
        borderTop:`3px solid ${catColor}`,
        borderRadius:8, padding:'10px 12px', cursor:'pointer', position:'relative',
      }}
      onMouseEnter={e=>{if(!selected)e.currentTarget.style.borderColor='#30363d';}}
      onMouseLeave={e=>{if(!selected)e.currentTarget.style.borderColor=small?'#5a2e00':'#21262d';}}
    >
      {small&&<div style={{ position:'absolute', top:6, right:8, fontSize:9, color:'#f59e0b', fontWeight:700 }}>⚠ n={n}</div>}
      <div style={{ fontSize:11, color:catColor, fontWeight:600, marginBottom:3, textTransform:'uppercase', letterSpacing:0.5 }}>{type.category}</div>
      <div style={{ fontSize:12, color:'#e6edf3', fontWeight:500, marginBottom:4, lineHeight:1.3 }}>{type.label}</div>
      <div style={{ fontSize:10, color:'#484f58', marginBottom:6, fontStyle:'italic' }}>
        {type.condition.length>80?type.condition.slice(0,77)+'…':type.condition}
      </div>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
        <div style={{ textAlign:'center' }}>
          <div style={{ fontSize:18, fontWeight:700, color:edgeColor(winRate-0.6426), fontFamily:'monospace' }}>{pct(winRate,1)}</div>
          <div style={{ fontSize:9, color:'#484f58' }}>win rate</div>
        </div>
        <div style={{ textAlign:'center' }}>
          <div style={{ fontSize:18, fontWeight:700, color:edgeColor(medianEdge), fontFamily:'monospace' }}>{sign(medianEdge)}{pct(medianEdge,1)}</div>
          <div style={{ fontSize:9, color:'#484f58' }}>edge médian</div>
        </div>
        <div style={{ textAlign:'center' }}>
          <div style={{ fontSize:11, color:'#8b949e', fontFamily:'monospace' }}>{n}</div>
          <div style={{ fontSize:9, color:'#484f58' }}>matchs</div>
        </div>
      </div>
      {bestBook&&(
        <div style={{ marginTop:5, fontSize:10, color:'#484f58' }}>
          Meilleur : <span style={{ color:edgeColor(bestBook.edgeVsBook) }}>{bookLabel(bestBook.book)} {sign(bestBook.edgeVsBook)}{pct(bestBook.edgeVsBook,1)}</span>
        </div>
      )}
    </div>
  );
}

function TypeDetail({ type, result }) {
  const [sortBy, setSortBy] = useState('edgeVsBook');
  if (!result) return null;
  const { n, winRate, byBook, medianEdge } = result;
  const sorted = [...byBook].sort((a,b) => {
    if (sortBy==='edgeVsBook')     return b.edgeVsBook-a.edgeVsBook;
    if (sortBy==='edgeVsPinnacle') return (b.edgeVsPinnacle??-99)-(a.edgeVsPinnacle??-99);
    if (sortBy==='roi')            return b.roi-a.roi;
    return 0;
  });
  const chartData=[...byBook].sort((a,b)=>b.edgeVsBook-a.edgeVsBook).slice(0,8)
    .map(b=>({ name:bookLabel(b.book), edge:+(b.edgeVsBook*100).toFixed(2) }));
  const ThCol=({k,label})=>(
    <th onClick={()=>setSortBy(k)} style={{ padding:'6px 8px', textAlign:k==='book'?'left':'right',
      color:sortBy===k?'#f59e0b':'#484f58', cursor:'pointer', fontSize:11, fontWeight:600, userSelect:'none' }}>
      {label}{sortBy===k?' ↓':''}
    </th>
  );
  return (
    <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
      <div style={{ background:'#0d1117', border:'1px solid #21262d', borderTop:`3px solid ${CAT_COLORS[type.category]||'#8b949e'}`, borderRadius:10, padding:'16px 20px' }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', flexWrap:'wrap', gap:12 }}>
          <div style={{ flex:1, minWidth:260 }}>
            <div style={{ fontSize:11, color:CAT_COLORS[type.category]||'#8b949e', fontWeight:600, marginBottom:4, textTransform:'uppercase' }}>{type.category}</div>
            <div style={{ fontSize:17, fontWeight:700, color:'#e6edf3', marginBottom:6 }}>{type.label}</div>
            <div style={{ background:'#0a0e18', border:'1px solid #1c2236', borderRadius:6, padding:'8px 12px' }}>
              <div style={{ fontSize:10, color:'#484f58', marginBottom:3, fontWeight:600 }}>Condition</div>
              <div style={{ fontSize:11, color:'#8b949e', lineHeight:1.6 }}>{type.condition}</div>
            </div>
            {n<MIN_N&&<div style={{ fontSize:11, color:'#f59e0b', marginTop:6 }}>⚠️ Petit échantillon ({n} matchs)</div>}
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:10 }}>
            {[{ label:'Matchs',v:n,color:'#e6edf3'},{ label:'Win rate',v:pct(winRate),color:edgeColor(winRate-0.6426)},{ label:'Edge médian',v:`${sign(medianEdge)}${pct(medianEdge)}`,color:edgeColor(medianEdge)}].map(({ label, v, color }) => (
              <div key={label} style={{ background:'#161b22', borderRadius:8, padding:'10px 14px', textAlign:'center' }}>
                <div style={{ fontSize:11, color:'#484f58', marginBottom:4 }}>{label}</div>
                <div style={{ fontSize:20, fontWeight:700, color, fontFamily:'monospace' }}>{v}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
      <div style={{ background:'#0d1117', border:'1px solid #21262d', borderRadius:10, padding:'14px 18px' }}>
        <div style={{ fontSize:11, color:'#484f58', fontWeight:600, letterSpacing:2, textTransform:'uppercase', marginBottom:12 }}>Edge vs Book (top 8)</div>
        <ResponsiveContainer width="100%" height={160}>
          <BarChart data={chartData} margin={{ top:4, right:8, left:-10, bottom:4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#21262d" />
            <XAxis dataKey="name" tick={{ fontSize:10, fill:'#8b949e' }} />
            <YAxis tick={{ fontSize:10, fill:'#8b949e' }} tickFormatter={v=>`${v}%`} />
            <Tooltip contentStyle={TOOLTIP_S} formatter={v=>[`${v}%`,'Edge']} />
            <ReferenceLine y={0} stroke="#484f58" />
            <Bar dataKey="edge" radius={[3,3,0,0]}>
              {chartData.map((d,i)=><Cell key={i} fill={edgeColor(d.edge/100)} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div style={{ background:'#0d1117', border:'1px solid #21262d', borderRadius:10, overflow:'hidden' }}>
        <div style={{ padding:'12px 16px', borderBottom:'1px solid #21262d', fontSize:12, fontWeight:600, color:'#e6edf3' }}>Par bookmaker — {sorted.length} books</div>
        <div style={{ overflowX:'auto' }}>
          <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
            <thead>
              <tr style={{ borderBottom:'1px solid #21262d' }}>
                <ThCol k="book" label="Bookmaker" />
                <th style={{ padding:'6px 8px', textAlign:'right', color:'#484f58', fontSize:11 }}>N</th>
                <ThCol k="winRate" label="Win rate" />
                <th style={{ padding:'6px 8px', textAlign:'right', color:'#484f58', fontSize:11 }}>Impl.</th>
                <ThCol k="edgeVsBook" label="Edge vs Book" />
                <ThCol k="edgeVsPinnacle" label="Edge vs Pinnacle" />
                <ThCol k="roi" label="ROI" />
              </tr>
            </thead>
            <tbody>
              {sorted.map((bk,i)=>(
                <tr key={bk.book} style={{ borderTop:'1px solid #161b22', background:i%2===0?'#0a0e18':'transparent' }}>
                  <td style={{ padding:'6px 8px' }}>
                    <span style={{ fontSize:12, color:'#e6edf3', fontWeight:500 }}>{bookLabel(bk.book)}</span>
                    {SHARP_BOOKS.has(bk.book)&&<span style={{ marginLeft:6, fontSize:9, background:'#132b50', color:'#60a5fa', padding:'1px 5px', borderRadius:3, fontWeight:700 }}>SHARP</span>}
                  </td>
                  <td style={{ padding:'6px 8px', textAlign:'right', color:'#484f58', fontSize:11 }}>{bk.n}</td>
                  <td style={{ padding:'6px 8px', textAlign:'right', fontFamily:'monospace', color:edgeColor(bk.winRate-0.6426) }}>{pct(bk.winRate)}</td>
                  <td style={{ padding:'6px 8px', textAlign:'right', fontFamily:'monospace', color:'#8b949e' }}>{pct(bk.avgImplied)}</td>
                  <td style={{ padding:'6px 8px', textAlign:'right', fontFamily:'monospace', fontWeight:700, color:edgeColor(bk.edgeVsBook) }}>{sign(bk.edgeVsBook)}{pct(bk.edgeVsBook)}</td>
                  <td style={{ padding:'6px 8px', textAlign:'right', fontFamily:'monospace', color:edgeColor(bk.edgeVsPinnacle) }}>{bk.edgeVsPinnacle!=null?`${sign(bk.edgeVsPinnacle)}${pct(bk.edgeVsPinnacle)}`:'—'}</td>
                  <td style={{ padding:'6px 8px', textAlign:'right', fontFamily:'monospace', color:edgeColor(bk.roi) }}>{sign(bk.roi)}{pct(bk.roi)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function RankingView({ results, onSelect, selectedId, sortBy, onSortChange }) {
  const sorted = useMemo(()=>[...results].filter(r=>r.result!==null).sort((a,b)=>{
    if (sortBy==='edge') return b.result.medianEdge-a.result.medianEdge;
    if (sortBy==='winRate') return b.result.winRate-a.result.winRate;
    if (sortBy==='n') return b.result.n-a.result.n;
    if (sortBy==='roi') return b.result.roiAll-a.result.roiAll;
    return 0;
  }), [results, sortBy]);

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
      <div style={{ display:'flex', alignItems:'center', gap:10, flexWrap:'wrap' }}>
        <span style={{ fontSize:12, color:'#8b949e' }}>Trier par :</span>
        {[['edge','Edge'],['winRate','Win rate'],['roi','ROI'],['n','N matchs']].map(([k,l])=>(
          <button key={k} onClick={()=>onSortChange(k)} style={{
            padding:'4px 10px', borderRadius:5, fontSize:11, fontWeight:600, cursor:'pointer',
            background:sortBy===k?'#132b50':'#0d1117',
            border:`1px solid ${sortBy===k?'#60a5fa':'#21262d'}`,
            color:sortBy===k?'#60a5fa':'#484f58',
          }}>{l}</button>
        ))}
      </div>
      <div style={{ background:'#0d1117', border:'1px solid #21262d', borderRadius:12, overflow:'hidden' }}>
        <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
          <thead>
            <tr style={{ borderBottom:'1px solid #21262d' }}>
              {['#','Type','Catégorie','N','Win rate','Edge médian','ROI','Meilleur book'].map(h=>(
                <th key={h} style={{ padding:'8px 12px', textAlign:['Type','Catégorie'].includes(h)?'left':'right', color:'#484f58', fontSize:11 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map(({ type, result }, i) => {
              const small=result.n<MIN_N, sel=selectedId===type.id;
              return (
                <tr key={type.id} onClick={()=>onSelect(type.id)}
                  style={{ borderTop:'1px solid #161b22', background:sel?'#0f2a18':i%2===0?'#0a0e18':'transparent', cursor:'pointer' }}
                  onMouseEnter={e=>{if(!sel)e.currentTarget.style.background='#161b22';}}
                  onMouseLeave={e=>{if(!sel)e.currentTarget.style.background=i%2===0?'#0a0e18':'transparent';}}
                >
                  <td style={{ padding:'6px 12px', color:'#484f58', fontSize:11 }}>{i+1}</td>
                  <td style={{ padding:'6px 12px' }}>
                    <span style={{ fontSize:12, color:'#e6edf3' }}>{type.label}</span>
                    {small&&<span style={{ marginLeft:4, fontSize:9, color:'#f59e0b' }}>⚠️</span>}
                  </td>
                  <td style={{ padding:'6px 12px' }}>
                    <span style={{ fontSize:10, fontWeight:600, color:CAT_COLORS[type.category]||'#8b949e' }}>{type.category}</span>
                  </td>
                  <td style={{ padding:'6px 12px', textAlign:'right', color:'#8b949e', fontSize:11 }}>{result.n}</td>
                  <td style={{ padding:'6px 12px', textAlign:'right', fontFamily:'monospace', color:edgeColor(result.winRate-0.6426) }}>{pct(result.winRate,1)}</td>
                  <td style={{ padding:'6px 12px', textAlign:'right', fontFamily:'monospace', fontWeight:700, color:edgeColor(result.medianEdge) }}>{sign(result.medianEdge)}{pct(result.medianEdge,1)}</td>
                  <td style={{ padding:'6px 12px', textAlign:'right', fontFamily:'monospace', color:edgeColor(result.roiAll) }}>{sign(result.roiAll)}{pct(result.roiAll,1)}</td>
                  <td style={{ padding:'6px 12px', textAlign:'right', fontSize:11, color:edgeColor(result.bestBook?.edgeVsBook) }}>
                    {result.bestBook?`${bookLabel(result.bestBook.book)} ${sign(result.bestBook.edgeVsBook)}${pct(result.bestBook.edgeVsBook,1)}`:'—'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}


function GridView({ results, onSelect, selectedId }) {
  const byCat = useMemo(() => {
    const map = {};
    results.forEach(({ type, result }) => {
      if (!map[type.category]) map[type.category] = [];
      map[type.category].push({ type, result });
    });
    return map;
  }, [results]);

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:20 }}>
      {CATEGORIES.map(cat => {
        const items = byCat[cat] || [];
        if (!items.length) return null;
        const color = CAT_COLORS[cat] || '#8b949e';
        return (
          <div key={cat}>
            <div style={{ fontSize:11, fontWeight:700, color, letterSpacing:2, textTransform:'uppercase', marginBottom:10, display:'flex', alignItems:'center', gap:8 }}>
              <div style={{ width:12, height:12, borderRadius:3, background:color }} />
              {cat} ({items.length})
            </div>
            <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(210px, 1fr))', gap:8 }}>
              {items.map(({ type, result }) => (
                <TypeCard key={type.id} type={type} result={result} onClick={onSelect} selected={selectedId === type.id} />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default function EdgeAnalyser({ matches, sharedOpcodes, threshModStat=-1, quantileMode=false }) {
  const { opcodes, stackHeight, isComplete, partialStack, results:fRes, push, undo, clear, loadOpcodes } =
    useFormula(matches, threshModStat, quantileMode);
  const [running,    setRunning]    = useState(false);
  const [computed,   setComputed]   = useState(null);
  const [segResults, setSegResults] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [sortBy,     setSortBy]     = useState('edge');
  const [catFilter,  setCatFilter]  = useState('Tout');
  const [viewMode,   setViewMode]   = useState('ranking');

  useEffect(() => {
    if (sharedOpcodes?.length > 0) loadOpcodes(sharedOpcodes);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleRun = useCallback(() => {
    if (!isComplete||!opcodes.length) return;
    setRunning(true); setSelectedId(null);
    setTimeout(() => {
      const base = computeEdgeAnalysis(opcodes, matches, threshModStat, quantileMode);
      if (!base) { setRunning(false); return; }
      setComputed(base);
      const allResults = MATCH_TYPES.map(type => {
        const idxMap   = base.pool.map((_,i)=>i).filter(i=>type.filter(base.pool[i]));
        const filtered = idxMap.map(i=>base.pool[i]);
        const filteredOutputs = idxMap.map(i=>base.outputs[i]);
        if (!filtered.length) return { type, result:null };
        return { type, result:analyseSegment(filtered, filteredOutputs, base.optimResult) };
      });
      setSegResults(allResults);
      setRunning(false);
    }, 20);
  }, [opcodes, isComplete, matches, threshModStat, quantileMode]);

  const selType   = useMemo(()=>MATCH_TYPES.find(t=>t.id===selectedId), [selectedId]);
  const selResult = useMemo(()=>segResults.find(r=>r.type.id===selectedId)?.result, [segResults, selectedId]);
  const filtered  = useMemo(()=>{
    const base = segResults.filter(r=>r.result!==null);
    return catFilter==='Tout'?base:base.filter(r=>r.type.category===catFilter);
  }, [segResults, catFilter]);

  const hasResults = segResults.length > 0;

  return (
    <div style={{ display:'flex', height:'100%' }}>
      <div style={{ width:440, minWidth:440, borderRight:'1px solid #21262d', overflowY:'auto', padding:'20px 18px' }}>
        <div style={{ marginBottom:16 }}>
          <div style={{ fontSize:18, fontWeight:700, color:'#e6edf3', marginBottom:2 }}>Edge Analyser</div>
          <div style={{ fontSize:12, color:'#484f58' }}>{MATCH_TYPES.length} types · {matches.filter(m=>m.has_odds).length} matchs avec cotes</div>
        </div>
        {sharedOpcodes?.length>0&&(
          <div style={{ marginBottom:14, background:'#0f2d10', border:'1px solid #3fb950', borderRadius:8, padding:'10px 14px' }}>
            <div style={{ fontSize:11, color:'#3fb950', fontWeight:600, marginBottom:6 }}>FORMULE DU PLAYGROUND</div>
            <div style={{ fontSize:11, color:'#8b949e', fontFamily:"'JetBrains Mono', monospace", marginBottom:8, wordBreak:'break-all' }}>{formulaToStr(sharedOpcodes)}</div>
            <button onClick={()=>loadOpcodes(sharedOpcodes)} style={{ width:'100%', padding:'7px', borderRadius:6, fontSize:12, fontWeight:600, background:'#132b50', border:'1px solid #60a5fa', color:'#60a5fa', cursor:'pointer' }}>← Charger</button>
          </div>
        )}
        <Calculator opcodes={opcodes} stackHeight={stackHeight} isComplete={isComplete}
          partialStack={partialStack} results={fRes} onPush={push} onUndo={undo} onClear={clear} onLoad={loadOpcodes}
          threshModStat={threshModStat} quantileMode={quantileMode} />
        <div style={{ marginTop:14 }}>
          <button onClick={handleRun} disabled={!isComplete||running} style={{
            width:'100%', padding:'12px', borderRadius:8, fontSize:14, fontWeight:600,
            background:isComplete&&!running?'#0f2d10':'#0d1117',
            border:`1px solid ${isComplete&&!running?'#3fb950':'#21262d'}`,
            color:isComplete&&!running?'#3fb950':'#484f58',
            cursor:isComplete&&!running?'pointer':'default',
          }}>
            {running?`⏳ Analyse de ${MATCH_TYPES.length} types…`:`▶ Lancer l'Edge Analysis`}
          </button>
        </div>
      </div>

      <div style={{ flex:1, overflowY:'auto', padding:'20px 24px' }}>
        {!hasResults ? (
          <div style={{ color:'#484f58', textAlign:'center', padding:'80px 20px', fontSize:14 }}>
            {running?`⏳ Analyse de ${MATCH_TYPES.length} types…`:"Construis une formule et lance l'Edge Analysis."}
          </div>
        ) : (
          <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
            {/* Toolbar */}
            <div style={{ display:'flex', gap:10, alignItems:'center', flexWrap:'wrap' }}>
              <ExportBtn
                data={segResults.filter(r=>r.result).map(r=>({ type:r.type.id, label:r.type.label, category:r.type.category, condition:r.type.condition, ...r.result, byBook:r.result.byBook }))}
                filename="edge_analysis.json"
                label="↓ Export JSON"
              />
              <div style={{ display:'flex', gap:4 }}>
                {[['ranking','📋 Classement'],['grid','🔲 Grille']].map(([k,label])=>(
                  <button key={k} onClick={()=>setViewMode(k)} style={{
                    padding:'5px 12px', borderRadius:5, fontSize:12, fontWeight:600, cursor:'pointer',
                    background:viewMode===k?'#132b50':'#0d1117',
                    border:`1px solid ${viewMode===k?'#60a5fa':'#21262d'}`,
                    color:viewMode===k?'#60a5fa':'#8b949e',
                  }}>{label}</button>
                ))}
              </div>
              <div style={{ display:'flex', gap:4, flexWrap:'wrap' }}>
                {['Tout',...CATEGORIES].map(cat=>{
                  const color=cat==='Tout'?'#8b949e':(CAT_COLORS[cat]||'#8b949e');
                  const active=catFilter===cat;
                  return (
                    <button key={cat} onClick={()=>setCatFilter(cat)} style={{
                      padding:'4px 8px', borderRadius:4, fontSize:10, fontWeight:600, cursor:'pointer',
                      background:active?'#161b22':'transparent',
                      border:`1px solid ${active?color:'#21262d'}`,
                      color:active?color:'#484f58',
                    }}>{cat}</button>
                  );
                })}
              </div>
            </div>
            {viewMode==='ranking'
              ? <RankingView results={filtered} onSelect={setSelectedId} selectedId={selectedId} sortBy={sortBy} onSortChange={setSortBy} />
              : <GridView    results={filtered} onSelect={setSelectedId} selectedId={selectedId} />
            }
            {selType&&selResult&&(
              <div style={{ borderTop:'1px solid #21262d', paddingTop:16 }}>
                <TypeDetail type={selType} result={selResult} />
              </div>
            )}
            <div style={{ background:'#0a0e18', border:'1px solid #1c2236', borderRadius:8, padding:'12px 16px' }}>
              <div style={{ fontSize:11, color:'#484f58', lineHeight:1.6 }}>
                <span style={{ color:'#60a5fa', fontWeight:600 }}>Méthodologie : </span>
                Threshold (buckété ou global) optimisé sur le dataset complet.
                {' '}Edge médian = médiane des (win rate − prob. implicite) sur tous les books.
                {' '}⚠️ n &lt; {MIN_N} = échantillon petit.
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
