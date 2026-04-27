import { useState, useMemo, useEffect } from 'react';
import { formulaToStr } from '../engine';
import { computeOddsAnalysis, bookLabel, SHARP_BOOKS } from '../hooks/useBetting';
import useFormula from '../hooks/useFormula';
import Calculator from './Calculator';
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis,
  Tooltip, CartesianGrid, ReferenceLine, Cell,
} from 'recharts';

const TOOLTIP_S = { background:'#161b22', border:'1px solid #30363d', borderRadius:8, fontSize:12, color:'#e6edf3' };
const pct  = (v, d=2) => v==null ? '—' : `${(v*100).toFixed(d)}%`;
const sign = v => v>=0?'+':'';

const edgeColor = v => {
  if (v==null) return '#484f58';
  if (v>0.04) return '#3fb950'; if (v>0.02) return '#56d364';
  if (v>0) return '#f59e0b'; if (v>-0.02) return '#d29922';
  return '#f85149';
};
const roiColor = v => {
  if (v==null) return '#484f58';
  if (v>0.05) return '#3fb950'; if (v>0) return '#56d364';
  if (v>-0.03) return '#f59e0b'; return '#f85149';
};

function BookDetail({ bk }) {
  if (!bk) return null;
  return (
    <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16, marginTop:16 }}>
      <div style={{ background:'#0d1117', border:'1px solid #21262d', borderRadius:10, padding:'14px 18px' }}>
        <div style={{ fontSize:11, color:'#484f58', fontWeight:600, letterSpacing:2, textTransform:'uppercase', marginBottom:12 }}>
          {bookLabel(bk.book)} — Par Saison
        </div>
        <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
          {bk.bySeason.map(s => (
            <div key={s.season} style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
              <span style={{ fontSize:12, color:'#8b949e' }}>{s.season}</span>
              <div style={{ display:'flex', gap:10, alignItems:'center' }}>
                <span style={{ fontSize:12, color:edgeColor(s.winRate-0.6426), fontFamily:'monospace', fontWeight:600 }}>{pct(s.winRate)}</span>
                <span style={{ fontSize:11, color:'#484f58' }}>n={s.n}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
      <div style={{ background:'#0d1117', border:'1px solid #21262d', borderRadius:10, padding:'14px 18px' }}>
        <div style={{ fontSize:11, color:'#484f58', fontWeight:600, letterSpacing:2, textTransform:'uppercase', marginBottom:12 }}>
          {bookLabel(bk.book)} — Par Niveau (MOV gap)
        </div>
        <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:8 }}>
          {[['Serré (<3)',bk.byGap.close],['Équil. (3-8)',bk.byGap.medium],['Écart (≥8)',bk.byGap.mismatch]].map(([label,g])=>(
            <div key={label} style={{ background:'#161b22', borderRadius:8, padding:'10px', textAlign:'center' }}>
              <div style={{ fontSize:10, color:'#484f58', marginBottom:4 }}>{label}</div>
              <div style={{ fontSize:22, fontWeight:700, color:edgeColor(g.winRate-0.6426), fontFamily:'monospace' }}>{pct(g.winRate,1)}</div>
              <div style={{ fontSize:10, color:'#484f58', marginTop:2 }}>{g.n} matchs</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function BettingAnalyser({ matches, sharedOpcodes, threshModStat=-1, quantileMode=false }) {
  const { opcodes, stackHeight, isComplete, partialStack, results, push, undo, clear, loadOpcodes } =
    useFormula(matches, threshModStat, quantileMode);
  const [selectedBook, setSelectedBook] = useState(null);
  const [sortBy, setSortBy]             = useState('edgeVsBook');

  // Load shared formula on mount
  useEffect(() => {
    if (sharedOpcodes?.length > 0) loadOpcodes(sharedOpcodes);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const analysis = useMemo(() => {
    if (!isComplete || !opcodes.length) return null;
    return computeOddsAnalysis(opcodes, matches, threshModStat, quantileMode);
  }, [isComplete, opcodes, matches, threshModStat, quantileMode]);

  const sorted = useMemo(() => {
    if (!analysis) return [];
    return [...analysis.bookmakers].sort((a,b) => {
      if (sortBy==='edgeVsBook')     return b.edgeVsBook-a.edgeVsBook;
      if (sortBy==='edgeVsPinnacle') return (b.edgeVsPinnacle??-99)-(a.edgeVsPinnacle??-99);
      if (sortBy==='roi')            return b.roi-a.roi;
      if (sortBy==='n')              return b.n-a.n;
      if (sortBy==='winRate')        return b.winRate-a.winRate;
      return 0;
    });
  }, [analysis, sortBy]);

  const selectedData = useMemo(() => analysis?.bookmakers.find(b=>b.book===selectedBook), [analysis, selectedBook]);

  const ThCol = ({ k, label }) => (
    <th onClick={() => setSortBy(k)} style={{
      padding:'6px 8px', textAlign:k==='book'?'left':'right',
      color:sortBy===k?'#f59e0b':'#484f58',
      cursor:'pointer', fontSize:11, fontWeight:600, userSelect:'none', whiteSpace:'nowrap',
    }}>
      {label}{sortBy===k?' ↓':''}
    </th>
  );

  return (
    <div style={{ display:'flex', height:'100%' }}>
      <div style={{ width:440, minWidth:440, borderRight:'1px solid #21262d', overflowY:'auto', padding:'20px 18px' }}>
        <div style={{ marginBottom:16 }}>
          <div style={{ fontSize:18, fontWeight:700, color:'#e6edf3', marginBottom:2 }}>Odds Analyser</div>
          <div style={{ fontSize:12, color:'#484f58' }}>
            {matches.filter(m=>m.has_odds).length} matchs avec cotes
          </div>
        </div>
        {sharedOpcodes?.length > 0 && (
          <div style={{ marginBottom:14, background:'#0f2d10', border:'1px solid #3fb950', borderRadius:8, padding:'10px 14px' }}>
            <div style={{ fontSize:11, color:'#3fb950', fontWeight:600, marginBottom:6 }}>FORMULE DU PLAYGROUND</div>
            <div style={{ fontSize:11, color:'#8b949e', fontFamily:"'JetBrains Mono', monospace", marginBottom:8, wordBreak:'break-all' }}>
              {formulaToStr(sharedOpcodes)}
            </div>
            <button onClick={() => loadOpcodes(sharedOpcodes)} style={{
              width:'100%', padding:'7px', borderRadius:6, fontSize:12, fontWeight:600,
              background:'#132b50', border:'1px solid #60a5fa', color:'#60a5fa', cursor:'pointer',
            }}>← Charger cette formule</button>
          </div>
        )}
        <Calculator
          opcodes={opcodes} stackHeight={stackHeight} isComplete={isComplete}
          partialStack={partialStack} results={results}
          onPush={push} onUndo={undo} onClear={clear} onLoad={loadOpcodes}
          threshModStat={threshModStat} quantileMode={quantileMode}
        />
        {analysis && (
          <div style={{ marginTop:14, background:'#0d1117', border:'1px solid #21262d', borderRadius:10, padding:'14px 18px' }}>
            <div style={{ fontSize:11, color:'#484f58', fontWeight:600, letterSpacing:2, textTransform:'uppercase', marginBottom:10 }}>Résumé</div>
            {[
              { label:'Accuracy globale', value:pct(analysis.globalScore), color:'#f59e0b' },
              { label:'Matchs avec cotes', value:analysis.n, color:'#e6edf3' },
              { label:'Bookmakers', value:analysis.bookmakers.length, color:'#e6edf3' },
            ].map(({ label, value, color }) => (
              <div key={label} style={{ display:'flex', justifyContent:'space-between', marginBottom:8 }}>
                <span style={{ fontSize:12, color:'#8b949e' }}>{label}</span>
                <span style={{ fontSize:13, fontWeight:600, color, fontFamily:'monospace' }}>{value}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div style={{ flex:1, overflowY:'auto', padding:'20px 24px' }}>
        {!analysis ? (
          <div style={{ color:'#484f58', textAlign:'center', padding:'80px 20px', fontSize:14 }}>
            {isComplete ? '⏳ Calcul en cours…' : 'Construis ou importe une formule pour lancer l\'analyse.'}
          </div>
        ) : (
          <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
            <div style={{ background:'#0d1117', border:'1px solid #21262d', borderRadius:12, overflow:'hidden' }}>
              <div style={{ padding:'14px 20px', borderBottom:'1px solid #21262d', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                <div style={{ fontSize:13, fontWeight:600, color:'#e6edf3' }}>
                  Performance par bookmaker — {sorted.length} books
                </div>
                <div style={{ fontSize:11, color:'#484f58' }}>Cliquer sur une ligne · Trier par colonne</div>
              </div>
              <div style={{ overflowX:'auto' }}>
                <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
                  <thead>
                    <tr style={{ borderBottom:'1px solid #21262d' }}>
                      <th style={{ padding:'8px', color:'#484f58', fontSize:11 }}>#</th>
                      <ThCol k="book" label="Bookmaker" />
                      <ThCol k="n" label="N matchs" />
                      <ThCol k="winRate" label="Win rate" />
                      <th style={{ padding:'6px 8px', textAlign:'right', color:'#484f58', fontSize:11 }}>Prob. impl.</th>
                      <ThCol k="edgeVsBook" label="Edge vs Book" />
                      <ThCol k="edgeVsPinnacle" label="Edge vs Pinnacle" />
                      <ThCol k="roi" label="ROI" />
                      <th style={{ padding:'6px 8px', textAlign:'right', color:'#484f58', fontSize:11 }}>Cote moy.</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sorted.map((bk, i) => {
                      const isSharp = SHARP_BOOKS.has(bk.book);
                      const isSel   = selectedBook===bk.book;
                      return (
                        <tr key={bk.book}
                          onClick={() => setSelectedBook(isSel?null:bk.book)}
                          style={{
                            borderTop:'1px solid #161b22',
                            background:isSel?'#0f2d10':i%2===0?'#0a0e18':'transparent',
                            cursor:'pointer',
                          }}
                          onMouseEnter={e=>{if(!isSel)e.currentTarget.style.background='#161b22';}}
                          onMouseLeave={e=>{if(!isSel)e.currentTarget.style.background=i%2===0?'#0a0e18':'transparent';}}
                        >
                          <td style={{ padding:'6px 8px', color:'#484f58', fontSize:11 }}>#{i+1}</td>
                          <td style={{ padding:'6px 8px' }}>
                            <span style={{ fontSize:12, color:'#e6edf3', fontWeight:500 }}>{bookLabel(bk.book)}</span>
                            {isSharp&&<span style={{ marginLeft:6, fontSize:9, background:'#132b50', color:'#60a5fa', padding:'1px 5px', borderRadius:3, fontWeight:700 }}>SHARP</span>}
                          </td>
                          <td style={{ padding:'6px 8px', textAlign:'right', color:'#8b949e' }}>{bk.n.toLocaleString('fr-FR')}</td>
                          <td style={{ padding:'6px 8px', textAlign:'right', fontFamily:'monospace', color:edgeColor(bk.winRate-0.6426) }}>{pct(bk.winRate)}</td>
                          <td style={{ padding:'6px 8px', textAlign:'right', fontFamily:'monospace', color:'#8b949e' }}>{pct(bk.avgImplied)}</td>
                          <td style={{ padding:'6px 8px', textAlign:'right', fontFamily:'monospace', fontWeight:700, color:edgeColor(bk.edgeVsBook) }}>
                            {sign(bk.edgeVsBook)}{pct(bk.edgeVsBook)}
                          </td>
                          <td style={{ padding:'6px 8px', textAlign:'right', fontFamily:'monospace', color:edgeColor(bk.edgeVsPinnacle) }}>
                            {bk.edgeVsPinnacle!=null?`${sign(bk.edgeVsPinnacle)}${pct(bk.edgeVsPinnacle)}`:'—'}
                          </td>
                          <td style={{ padding:'6px 8px', textAlign:'right', fontFamily:'monospace', fontWeight:600, color:roiColor(bk.roi) }}>
                            {sign(bk.roi)}{pct(bk.roi)}
                          </td>
                          <td style={{ padding:'6px 8px', textAlign:'right', fontFamily:'monospace', color:'#8b949e' }}>
                            {bk.avgOdds.toFixed(3)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {selectedData && <BookDetail bk={selectedData} />}

            <div style={{ background:'#0d1117', border:'1px solid #21262d', borderRadius:12, padding:'14px 20px' }}>
              <div style={{ fontSize:11, color:'#484f58', fontWeight:600, letterSpacing:2, textTransform:'uppercase', marginBottom:12 }}>
                Accuracy globale par saison
              </div>
              <div style={{ display:'flex', gap:12 }}>
                {analysis.bySeason.map(s=>(
                  <div key={s.season} style={{ flex:1, background:'#161b22', borderRadius:8, padding:'12px', textAlign:'center' }}>
                    <div style={{ fontSize:11, color:'#484f58', marginBottom:6 }}>{s.season}</div>
                    <div style={{ fontSize:22, fontWeight:700, color:edgeColor(s.winRate-0.6426), fontFamily:'monospace' }}>{pct(s.winRate)}</div>
                    <div style={{ fontSize:10, color:'#484f58', marginTop:4 }}>{s.n} matchs</div>
                  </div>
                ))}
              </div>
            </div>

            <div style={{ background:'#0a0e18', border:'1px solid #1c2236', borderRadius:8, padding:'12px 16px' }}>
              <div style={{ fontSize:11, color:'#484f58', lineHeight:1.6 }}>
                <span style={{ color:'#60a5fa', fontWeight:600 }}>Méthodologie : </span>
                Threshold optimisé sur l'ensemble du dataset, appliqué aux matchs avec cotes.
                {' '}⚠️ Métriques in-sample — valider sur données futures avant de parier.
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
