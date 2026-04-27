import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip,
  CartesianGrid, LineChart, Line, ReferenceLine, Cell,
} from 'recharts';

const BASELINE   = 0.6426;
const BREAKEVEN  = 1/1.87;
const TOOLTIP_S  = { background:'#161b22', border:'1px solid #30363d', borderRadius:8, fontSize:12, color:'#e6edf3' };
const pct = (v, d=2) => v==null ? '—' : `${(v*100).toFixed(d)}%`;
const scoreColor = v => {
  if (v==null) return '#8b949e';
  if (v>0.70) return '#22c55e';
  if (v>0.68) return '#3fb950';
  if (v>0.66) return '#56d364';
  if (v>0.64) return '#f59e0b';
  if (v>0.60) return '#d29922';
  return '#f85149';
};

function Card({ title, children, accent, warning }) {
  const bt = accent?'2px solid #3fb950':warning?'2px solid #f59e0b':'1px solid #21262d';
  return (
    <div style={{ background:'#0d1117', border:'1px solid #21262d', borderRadius:12, padding:'18px 20px', borderTop:bt }}>
      <div style={{ fontSize:11, fontWeight:600, letterSpacing:2, textTransform:'uppercase', color:'#8b949e', marginBottom:14 }}>{title}</div>
      {children}
    </div>
  );
}

function MiniBar({ value }) {
  if (value==null) return <span style={{ color:'#484f58' }}>—</span>;
  const w=Math.min(100,Math.max(0,value*100));
  const bw=Math.min(100,Math.max(0,BASELINE*100));
  const bew=Math.min(100,Math.max(0,BREAKEVEN*100));
  return (
    <div style={{ display:'flex', alignItems:'center', gap:8 }}>
      <div style={{ flex:1, height:6, background:'#21262d', borderRadius:3, position:'relative' }}>
        <div style={{ width:`${w}%`, height:'100%', background:scoreColor(value), borderRadius:3, transition:'width .3s' }} />
        <div title="Baseline" style={{ position:'absolute', top:-2, left:`${bw}%`, width:2, height:10, background:'#484f58', borderRadius:1 }} />
        <div title="Break-even" style={{ position:'absolute', top:-2, left:`${bew}%`, width:2, height:10, background:'#f59e0b', borderRadius:1 }} />
      </div>
      <span style={{ fontSize:13, fontWeight:600, color:scoreColor(value), fontFamily:"'JetBrains Mono', monospace", width:52, textAlign:'right' }}>
        {pct(value)}
      </span>
    </div>
  );
}

const BUCKET_LABELS_INT = ['≤−3','−2','−1',' 0','+1','+2','≥+3'];

function ScoreGlobal({ results }) {
  const delta = results.score - BASELINE;
  const { threshModStat, quantileMode, bucketThresholds, bucketBoundaries, bucketCounts } = results;

  return (
    <Card title="Score Global" accent>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', flexWrap:'wrap', gap:16 }}>
        <div>
          <div style={{ fontSize:56, fontWeight:700, lineHeight:1, color:scoreColor(results.score), fontFamily:"'JetBrains Mono', monospace" }}>
            {pct(results.score)}
          </div>
          <div style={{ marginTop:8, display:'flex', gap:20, flexWrap:'wrap', alignItems:'center' }}>
            <span style={{ fontSize:13, color:delta>=0?'#3fb950':'#f85149', fontWeight:600 }}>
              {delta>=0?'+':''}{pct(delta)} vs baseline
            </span>
            {threshModStat < 0 && results.threshold != null && (
              <span style={{ fontSize:12, color:'#8b949e', fontFamily:'monospace' }}>
                thr = {results.threshold>0?'+':''}{results.threshold.toFixed(4)}
              </span>
            )}
            {results.consts?.length > 0 && (
              <span style={{ fontSize:12, color:'#8b949e', fontFamily:'monospace' }}>
                {results.consts.map((c,i)=>`c${i+1}=${c}`).join('  ')}
              </span>
            )}
          </div>
          <div style={{ marginTop:8, display:'flex', gap:16, flexWrap:'wrap' }}>
            {[
              { label:'baseline',       v:BASELINE,  color:'#484f58' },
              { label:'break-even Winamax', v:BREAKEVEN, color:'#f59e0b' },
            ].map(({label,v,color})=>(
              <div key={label} style={{ textAlign:'center' }}>
                <div style={{ fontSize:16, fontWeight:600, color, fontFamily:'monospace' }}>{pct(v)}</div>
                <div style={{ fontSize:10, color:'#484f58' }}>{label}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Bucketed thresholds */}
      {threshModStat >= 0 && bucketThresholds && (
        <div style={{ marginTop:16, padding:'12px 14px', background:'#0a0e18', borderRadius:8, border:'1px solid #1c2236' }}>
          <div style={{ fontSize:11, color:'#484f58', marginBottom:10 }}>
            Thresholds buckétés — {quantileMode ? 'mode quantile' : 'mode entier'}
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(7,1fr)', gap:4 }}>
            {bucketThresholds.map((t, b) => {
              let label;
              if (quantileMode && bucketBoundaries) {
                label = b === 0 ? `Q1` : b === 6 ? `Q7` : `Q${b+1}`;
              } else {
                label = BUCKET_LABELS_INT[b];
              }
              return (
                <div key={b} style={{ background:'#161b22', borderRadius:6, padding:'8px 4px', textAlign:'center' }}>
                  <div style={{ fontSize:9, color:'#484f58', marginBottom:3 }}>{label}</div>
                  <div style={{ fontSize:11, color:'#f59e0b', fontFamily:'monospace', fontWeight:600 }}>
                    {t > 0 ? '+' : ''}{t.toFixed(2)}
                  </div>
                  <div style={{ fontSize:9, color:'#30363d', marginTop:2 }}>n={bucketCounts?.[b]??0}</div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {results.formulaStrConsts && (
        <div style={{ marginTop:14, padding:'10px 14px', background:'#0a0e18', borderRadius:8, border:'1px solid #1c2236' }}>
          <span style={{ fontSize:13, color:'#e6edf3', fontFamily:"'JetBrains Mono', monospace" }}>{results.formulaStrConsts}</span>
        </div>
      )}
    </Card>
  );
}

function BiasRisk({ results }) {
  const { tp, tn, fp, fn, biasSide, biasRatio, correlation, worstLoss, seasonStdDev } = results;
  const biasColor  = biasRatio>0.3?'#f85149':biasRatio>0.1?'#f59e0b':'#3fb950';
  const corrColor  = Math.abs(correlation)>0.15?'#3fb950':Math.abs(correlation)>0.08?'#f59e0b':'#f85149';
  const worstColor = worstLoss>20?'#f85149':worstLoss>10?'#f59e0b':'#3fb950';
  const stdColor   = seasonStdDev>0.03?'#f85149':seasonStdDev>0.015?'#f59e0b':'#3fb950';
  return (
    <Card title="Analyse des Risques" warning>
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16 }}>
        <div>
          <div style={{ fontSize:11, color:'#8b949e', marginBottom:8, fontWeight:600 }}>Matrice de confusion</div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:4, marginBottom:8 }}>
            {[
              { label:'Vrais positifs', v:tp, color:'#3fb950', sub:'A prédit ✓' },
              { label:'Faux positifs',  v:fp, color:'#f85149', sub:'A prédit ✗' },
              { label:'Faux négatifs',  v:fn, color:'#f85149', sub:'B prédit ✗' },
              { label:'Vrais négatifs', v:tn, color:'#3fb950', sub:'B prédit ✓' },
            ].map(({label,v,color,sub})=>(
              <div key={label} style={{ background:'#161b22', borderRadius:6, padding:'8px 10px', textAlign:'center' }}>
                <div style={{ fontSize:20, fontWeight:700, color, fontFamily:'monospace' }}>{v}</div>
                <div style={{ fontSize:10, color:'#8b949e' }}>{label}</div>
                <div style={{ fontSize:10, color:'#484f58' }}>{sub}</div>
              </div>
            ))}
          </div>
          <div style={{ fontSize:12, color:biasColor }}>
            Biais : {biasRatio>0.05?`sur-prédit ${biasSide}`:'neutre'} ({(biasRatio*100).toFixed(1)}%)
          </div>
        </div>
        <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
          {[
            { label:'Corrélation Pearson', v:correlation.toFixed(4), color:corrColor, sub:Math.abs(correlation)>0.15?'Signal fort':Math.abs(correlation)>0.08?'Signal modéré':'Signal faible' },
            { label:'Pire série défaites', v:`${worstLoss} consécutives`, color:worstColor, sub:worstLoss>20?'Variance élevée':worstLoss>10?'Variance normale':'Variance faible' },
            { label:'Écart-type inter-saisons', v:`${(seasonStdDev*100).toFixed(2)}%`, color:stdColor, sub:seasonStdDev>0.03?'Instable':seasonStdDev>0.015?'Légère instabilité':'Stable' },
          ].map(({label,v,color,sub})=>(
            <div key={label}>
              <div style={{ fontSize:11, color:'#8b949e', marginBottom:4 }}>{label}</div>
              <div style={{ fontSize:22, fontWeight:700, color, fontFamily:'monospace' }}>{v}</div>
              <div style={{ fontSize:11, color:'#484f58' }}>{sub}</div>
            </div>
          ))}
        </div>
      </div>
    </Card>
  );
}

function ROISimulation({ roiAll, roiTop25, roiTop10, winamaxOdds }) {
  const roiColor = v => v>0.05?'#3fb950':v>0?'#56d364':v>-0.03?'#f59e0b':'#f85149';
  const rows = [
    { label:'Tous les matchs', data:roiAll, desc:'Parie sur chaque match' },
    { label:'Top 25% confiance', data:roiTop25, desc:'Prédictions les plus confiantes' },
    { label:'Top 10% confiance', data:roiTop10, desc:'Très confiantes seulement' },
  ];
  return (
    <Card title={`Simulation ROI — Winamax (cote ${winamaxOdds}, break-even 53.48%)`}>
      <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:12 }}>
        {rows.map(({ label, data, desc }) => (
          <div key={label} style={{ background:'#161b22', borderRadius:8, padding:'14px' }}>
            <div style={{ fontSize:11, color:'#8b949e', marginBottom:8 }}>{label}</div>
            <div style={{ fontSize:26, fontWeight:700, color:roiColor(data.roi), fontFamily:'monospace' }}>
              {data.roi>=0?'+':''}{(data.roi*100).toFixed(2)}%
            </div>
            <div style={{ fontSize:11, color:'#484f58', marginTop:4 }}>ROI par pari</div>
            <div style={{ marginTop:8, fontSize:12, color:'#8b949e' }}>{data.wins}/{data.bets} paris gagnés</div>
            <div style={{ fontSize:12, color:scoreColor(data.winRate) }}>{pct(data.winRate)} win rate</div>
            <div style={{ fontSize:11, color:data.totalUnits>=0?'#3fb950':'#f85149', marginTop:4 }}>
              {data.totalUnits>=0?'+':''}{data.totalUnits.toFixed(1)} unités
            </div>
            <div style={{ fontSize:10, color:'#484f58', marginTop:4 }}>{desc}</div>
          </div>
        ))}
      </div>
      <div style={{ marginTop:12, fontSize:12, color:'#484f58' }}>
        Simulation in-sample. Un ROI &gt; 0 est un signal — valider sur données futures.
      </div>
    </Card>
  );
}

function BySeason({ bySeason, trainTest }) {
  return (
    <Card title="Performance par Saison">
      <div style={{ display:'flex', gap:20, flexWrap:'wrap' }}>
        <div style={{ flex:1, minWidth:240 }}>
          {bySeason.map(({ season, score, n }) => (
            <div key={season} style={{ marginBottom:12 }}>
              <div style={{ display:'flex', justifyContent:'space-between', marginBottom:4 }}>
                <span style={{ fontSize:13, color:'#e6edf3', fontFamily:"'JetBrains Mono', monospace" }}>{season}</span>
                <span style={{ fontSize:11, color:'#484f58' }}>{n} matchs</span>
              </div>
              <MiniBar value={score} />
            </div>
          ))}
        </div>
        {trainTest && (
          <div style={{ background:'#0a0e18', borderRadius:10, padding:'14px 18px', border:'1px solid #1c2236', minWidth:200 }}>
            <div style={{ fontSize:11, color:'#8b949e', marginBottom:12, fontWeight:600 }}>Validation Temporelle</div>
            <div style={{ marginBottom:14 }}>
              <div style={{ fontSize:11, color:'#484f58', marginBottom:4 }}>Train (saisons N-1)</div>
              <div style={{ fontSize:24, fontWeight:700, color:scoreColor(trainTest.trainScore), fontFamily:'monospace' }}>
                {pct(trainTest.trainScore)}
              </div>
            </div>
            <div style={{ borderTop:'1px solid #21262d', paddingTop:14 }}>
              <div style={{ fontSize:11, color:'#484f58', marginBottom:4 }}>Test ({trainTest.testSeason})</div>
              <div style={{ fontSize:24, fontWeight:700, color:scoreColor(trainTest.testScore), fontFamily:'monospace' }}>
                {pct(trainTest.testScore)}
              </div>
              <div style={{ fontSize:11, color:trainTest.testScore>=trainTest.trainScore?'#3fb950':'#f85149', marginTop:6 }}>
                {trainTest.testScore>=trainTest.trainScore?'✓ Généralise bien':'⚠ Possible overfitting'}
              </div>
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}

function HomeAway({ homeScore, awayScore, homeRate }) {
  return (
    <Card title="Accuracy — Vraies victoires home vs away">
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:20 }}>
        {[
          { label:'MATCHS OÙ HOME GAGNE', score:homeScore, color:'#60a5fa', sub:`${(homeRate*100).toFixed(1)}% des matchs` },
          { label:'MATCHS OÙ AWAY GAGNE', score:awayScore, color:'#fb923c', sub:`${((1-homeRate)*100).toFixed(1)}% des matchs` },
        ].map(({label,score,color,sub})=>(
          <div key={label}>
            <div style={{ fontSize:11, color, marginBottom:8, fontWeight:600 }}>{label}</div>
            <div style={{ fontSize:30, fontWeight:700, color:scoreColor(score), fontFamily:'monospace' }}>{pct(score)}</div>
            <div style={{ fontSize:11, color:'#484f58', marginTop:4 }}>{sub}</div>
          </div>
        ))}
      </div>
      <div style={{ marginTop:12, fontSize:11, color:'#484f58' }}>
        Accuracy conditionnelle — montre si la formule capte mieux les vraies victoires home ou away.
      </div>
    </Card>
  );
}

function ByGap({ byGap }) {
  const items = [
    { label:'Serré',        sub:'|ΔMOV_s| < 2',  data:byGap.close,    color:'#8b949e' },
    { label:'Équilibré',    sub:'2–8',             data:byGap.medium,   color:'#f59e0b' },
    { label:'Déséquilibré', sub:'|ΔMOV_s| ≥ 8',   data:byGap.mismatch, color:'#3fb950' },
  ];
  return (
    <Card title="Par Niveau du Match (MOV_s gap)">
      <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:12 }}>
        {items.map(({ label, sub, data, color }) => (
          <div key={label} style={{ background:'#161b22', borderRadius:8, padding:'14px', textAlign:'center' }}>
            <div style={{ fontSize:11, color:'#8b949e', marginBottom:6 }}>{label}</div>
            <div style={{ fontSize:26, fontWeight:700, color:scoreColor(data?.score), fontFamily:'monospace' }}>{pct(data?.score)}</div>
            <div style={{ fontSize:10, color:'#484f58', marginTop:4 }}>{sub}</div>
            <div style={{ fontSize:11, color:'#484f58' }}>{data?.n} matchs</div>
          </div>
        ))}
      </div>
    </Card>
  );
}

function ByMonth({ byMonth }) {
  const data = byMonth.map(({ month, score, n }) => ({ month, score:score!=null?+(score*100).toFixed(2):null, n }));
  return (
    <Card title="Performance par Mois">
      <ResponsiveContainer width="100%" height={180}>
        <BarChart data={data} margin={{ top:5, right:10, left:-10, bottom:5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#21262d" />
          <XAxis dataKey="month" tick={{ fontSize:11, fill:'#8b949e' }} />
          <YAxis domain={[50,75]} tick={{ fontSize:11, fill:'#8b949e' }} tickFormatter={v=>`${v}%`} />
          <Tooltip contentStyle={TOOLTIP_S} formatter={v=>[`${v}%`,'Score']} />
          <ReferenceLine y={BASELINE*100} stroke="#484f58" strokeDasharray="4 2" />
          <ReferenceLine y={BREAKEVEN*100} stroke="#f59e0b" strokeDasharray="4 2" />
          <Bar dataKey="score" radius={[4,4,0,0]}>
            {data.map((d,i)=><Cell key={i} fill={scoreColor(d.score/100)} />)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </Card>
  );
}

function ByEloDiff({ byEloDiff }) {
  if (!byEloDiff?.length) return null;
  const data = byEloDiff.map(({ range, score, n }) => ({ range, score:score!=null?+(score*100).toFixed(2):null, n }));
  return (
    <Card title="Par Écart Elo (|A_elo − B_elo|)">
      <ResponsiveContainer width="100%" height={180}>
        <LineChart data={data} margin={{ top:5, right:10, left:-10, bottom:5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#21262d" />
          <XAxis dataKey="range" tick={{ fontSize:11, fill:'#8b949e' }} />
          <YAxis domain={[50,80]} tick={{ fontSize:11, fill:'#8b949e' }} tickFormatter={v=>`${v}%`} />
          <Tooltip contentStyle={TOOLTIP_S} formatter={(v,_,p)=>[`${v}%  (${p.payload.n} matchs)`,'Score']} />
          <ReferenceLine y={BASELINE*100} stroke="#484f58" strokeDasharray="4 2" />
          <ReferenceLine y={BREAKEVEN*100} stroke="#f59e0b" strokeDasharray="4 2" />
          <Line type="monotone" dataKey="score" stroke="#f59e0b" strokeWidth={2} dot={{ fill:'#f59e0b', r:4 }} />
        </LineChart>
      </ResponsiveContainer>
      <div style={{ fontSize:11, color:'#484f58', marginTop:8 }}>
        Un score croissant avec l'écart Elo = la formule capte bien les mismatches clairs.
      </div>
    </Card>
  );
}

function Distribution({ distribution, threshold }) {
  return (
    <Card title="Distribution des Outputs f(A,B)">
      <ResponsiveContainer width="100%" height={200}>
        <BarChart data={distribution} margin={{ top:5, right:10, left:-10, bottom:5 }} barSize={14}>
          <CartesianGrid strokeDasharray="3 3" stroke="#21262d" />
          <XAxis dataKey="x" tick={{ fontSize:9, fill:'#8b949e' }} interval={3} />
          <YAxis tick={{ fontSize:11, fill:'#8b949e' }} />
          <Tooltip contentStyle={TOOLTIP_S} formatter={(v,name)=>[v,name==='correct'?'✓ Correct':'✗ Incorrect']} />
          <Bar dataKey="correct"   stackId="a" fill="#3fb950" />
          <Bar dataKey="incorrect" stackId="a" fill="#f85149" radius={[3,3,0,0]} />
          {threshold!=null && (
            <ReferenceLine x={threshold?.toFixed(2)} stroke="#f59e0b" strokeDasharray="4 2"
              label={{ value:'thr', position:'top', fontSize:10, fill:'#f59e0b' }} />
          )}
        </BarChart>
      </ResponsiveContainer>
    </Card>
  );
}

function Confidence({ confidence }) {
  return (
    <Card title="Confiance vs Précision (déciles)">
      <ResponsiveContainer width="100%" height={180}>
        <LineChart data={confidence} margin={{ top:5, right:10, left:-10, bottom:5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#21262d" />
          <XAxis dataKey="decile" tick={{ fontSize:11, fill:'#8b949e' }} />
          <YAxis domain={[45,80]} tick={{ fontSize:11, fill:'#8b949e' }} tickFormatter={v=>`${v}%`} />
          <Tooltip contentStyle={TOOLTIP_S} formatter={(v,_,p)=>[`${v}%  (conf≈${p.payload.confidence})`,'Précision']} />
          <ReferenceLine y={BASELINE*100}  stroke="#484f58" strokeDasharray="4 2" />
          <ReferenceLine y={BREAKEVEN*100} stroke="#f59e0b" strokeDasharray="4 2" />
          <Line type="monotone" dataKey="accuracy" stroke="#60a5fa" strokeWidth={2} dot={{ fill:'#60a5fa', r:4 }} />
        </LineChart>
      </ResponsiveContainer>
      <div style={{ fontSize:11, color:'#484f58', marginTop:8 }}>
        Déciles 1→10 : du moins confiant au plus confiant. Une courbe croissante = bonne calibration.
      </div>
    </Card>
  );
}

export default function Report({ results }) {
  if (!results) {
    return (
      <div style={{ color:'#484f58', textAlign:'center', padding:'60px 20px', fontSize:14 }}>
        Construis ou importe une formule complète pour voir l'analyse.
      </div>
    );
  }
  return (
    <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
      <ScoreGlobal results={results} />
      <BiasRisk results={results} />
      <ROISimulation roiAll={results.roiAll} roiTop25={results.roiTop25} roiTop10={results.roiTop10} winamaxOdds={results.winamaxOdds} />
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16 }}>
        <HomeAway homeScore={results.homeScore} awayScore={results.awayScore} homeRate={results.homeRate} />
        <ByGap byGap={results.byGap} />
      </div>
      <BySeason bySeason={results.bySeason} trainTest={results.trainTest} />
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16 }}>
        <ByMonth byMonth={results.byMonth} />
        {results.byEloDiff?.length > 0 && <ByEloDiff byEloDiff={results.byEloDiff} />}
      </div>
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16 }}>
        <Distribution distribution={results.distribution} threshold={results.threshold} />
        <Confidence confidence={results.confidence} />
      </div>
    </div>
  );
}
