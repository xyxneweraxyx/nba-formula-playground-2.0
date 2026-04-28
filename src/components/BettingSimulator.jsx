import { useState, useMemo, useEffect } from 'react';
import { formulaToStr, evalAll, optimize, predictMatch } from '../engine';
import { bookLabel, SHARP_BOOKS } from '../hooks/useBetting';
import useFormula from '../hooks/useFormula';
import Calculator from './Calculator';
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis,
  Tooltip, CartesianGrid, ReferenceLine, BarChart, Bar, Cell,
} from 'recharts';

const ALL_SEASONS = ['2021-22','2022-23','2023-24','2024-25','2025-26'];
const TOOLTIP_S   = { background:'#161b22', border:'1px solid #30363d', borderRadius:8, fontSize:12, color:'#e6edf3' };
const pct  = (v, d=2) => v==null ? '—' : `${(v*100).toFixed(d)}%`;
const sign = v => v>=0 ? '+' : '';
const eur  = v => `${sign(v)}${v.toFixed(2)}€`;
const roiC = v => v>0.05?'#3fb950':v>0?'#56d364':v>-0.03?'#f59e0b':'#f85149';
const pnlC = v => v>0 ? '#3fb950' : v<0 ? '#f85149' : '#8b949e';

const ALL_BOOKS = [
  'pinnacle','betfair_ex_eu','matchbook','betfair',
  'winamax_fr','winamax_de','betclic_fr','betclic',
  'unibet_fr','unibet','unibet_eu','nordicbet','betsson',
  'marathonbet','sport888','williamhill','betonlineag',
  'mybookieag','coolbet','gtbets','everygame',
  'tipico_de','livescorebet_eu','suprabets',
];

const MATCH_FILTERS = [
  { id:'gap_close',    label:'Serrés (|ΔMOV_s|<3)',    cat:'Niveau',   fn:m=>Math.abs(m.stats[12]-m.stats[13])<3 },
  { id:'gap_medium',   label:'Équilibrés (3-8)',        cat:'Niveau',   fn:m=>{const g=Math.abs(m.stats[12]-m.stats[13]);return g>=3&&g<8;} },
  { id:'gap_mismatch', label:'Mismatch (≥8)',           cat:'Niveau',   fn:m=>Math.abs(m.stats[12]-m.stats[13])>=8 },
  { id:'h_b2b',        label:'Home B2B (rest=1)',       cat:'Repos',    fn:m=>m.stats[0]===1 },
  { id:'a_b2b',        label:'Away B2B (rest=1)',       cat:'Repos',    fn:m=>m.stats[1]===1 },
  { id:'h_b2b_a_rest', label:'Home B2B + Away reposé', cat:'Repos',    fn:m=>m.stats[0]===1&&m.stats[1]>=2 },
  { id:'h_streak3',    label:'Home série+ (≥3)',        cat:'Momentum', fn:m=>m.stats[4]>=3 },
  { id:'h_streak_neg', label:'Home série- (≤-3)',       cat:'Momentum', fn:m=>m.stats[4]<=-3 },
  { id:'a_streak3',    label:'Away série+ (≥3)',        cat:'Momentum', fn:m=>m.stats[5]>=3 },
  { id:'p_heavy_h',    label:'Favori home >70%',        cat:'Marché',   fn:m=>m.no_vig_ref?.home>0.70 },
  { id:'p_coin',       label:'Coin flip (45-55%)',      cat:'Marché',   fn:m=>{const p=m.no_vig_ref?.home;return p&&p>=0.45&&p<=0.55;} },
  { id:'p_heavy_a',    label:'Favori away >70%',        cat:'Marché',   fn:m=>m.no_vig_ref?.home<0.30 },
  { id:'elo_gt100',    label:'Elo gap > 100',           cat:'Elo',      fn:m=>Math.abs(m.stats[14]-m.stats[15])>100 },
  { id:'elo_lt50',     label:'Elo gap < 50',            cat:'Elo',      fn:m=>Math.abs(m.stats[14]-m.stats[15])<50 },
];
const FILTER_CATS = [...new Set(MATCH_FILTERS.map(f=>f.cat))];

const DEFAULT_CONSTRAINTS = {
  enabled:false, maxStakePct:5, maxOdds:5.0, minOdds:1.25,
  stopLossPct:50, maxConsecLosses:15, flatKellyFraction:0.25,
};

function predictOne(output, match, optimResult) {
  if (optimResult.threshModStat >= 0 && optimResult.bucketThresholds)
    return predictMatch(output, match.stats, optimResult);
  return output > optimResult.threshold;
}

// ── ISO week helper ───────────────────────────────────────────────────────────
function isoWeek(dateStr) {
  const d = new Date(dateStr + 'T12:00:00');
  const day = d.getDay() || 7;
  d.setDate(d.getDate() + 4 - day);
  const yearStart = new Date(d.getFullYear(), 0, 1);
  const week = Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
  return `${d.getFullYear()}-W${String(week).padStart(2,'0')}`;
}

// ── Core simulation ───────────────────────────────────────────────────────────
function runSimulation(opcodes, params, matches, threshModStat, quantileMode) {
  const { seasons, bookmakers, strategy, initialBankroll, stakePerBet,
          activeFilters, confidence, constraints } = params;
  if (!opcodes.length || !bookmakers.length || !seasons.length) return null;

  const optimResult = optimize(opcodes, matches, threshModStat, quantileMode);
  const { consts } = optimResult;

  let pool = matches.filter(m => {
    if (!m.has_odds||!m.odds) return false;
    if (!seasons.includes(m.season)) return false;
    if (!bookmakers.some(b=>m.odds[b])) return false;
    return true;
  }).sort((a,b)=>a.date.localeCompare(b.date));
  if (!pool.length) return { empty:true };

  if (activeFilters.length>0) {
    const fns = MATCH_FILTERS.filter(f=>activeFilters.includes(f.id)).map(f=>f.fn);
    pool = pool.filter(m=>fns.every(fn=>fn(m)));
  }
  if (!pool.length) return { empty:true };

  let outputs = evalAll(opcodes, consts, pool);

  if (confidence!=='all') {
    const confs = outputs.map(o=>Math.abs(o-optimResult.threshold)).sort((a,b)=>a-b);
    const pctIdx = confidence==='top25'?0.75:0.90;
    const minConf = confs[Math.floor(confs.length*pctIdx)]??0;
    const kept = pool.map((m,i)=>({m,o:outputs[i],c:Math.abs(outputs[i]-optimResult.threshold)})).filter(x=>x.c>=minConf);
    pool    = kept.map(x=>x.m);
    outputs = kept.map(x=>x.o);
  }
  if (!pool.length) return { empty:true };

  const C = constraints?.enabled ? constraints : DEFAULT_CONSTRAINTS;
  let bankroll=initialBankroll, peak=initialBankroll, maxDD=0;
  const equity=[{ date:'Départ', value:bankroll }];
  let totalBets=0, totalWins=0, totalPnL=0, consecLosses=0;
  let longestWS=0, longestLS=0, curWS=0, curLS=0, totalOddsSum=0;
  let grossWins=0, grossLosses=0;
  let stopped=false, stopReason='';
  const byBook={}, bySeason={};
  bookmakers.forEach(b=>{byBook[b]={bets:0,wins:0,pnl:0};});

  // Per-match detail log
  const matchLog = [];
  // Per-date aggregation
  const byDate = {};

  pool.forEach((match,i) => {
    if (stopped) return;
    if (C.enabled && bankroll < initialBankroll*(1-C.stopLossPct/100)) {
      stopped=true; stopReason=`Stop-loss (bankroll < ${100-C.stopLossPct}% initiale)`; return;
    }
    if (C.enabled && consecLosses >= C.maxConsecLosses) {
      stopped=true; stopReason=`${C.maxConsecLosses} pertes consécutives`; return;
    }

    const out = outputs[i];
    const predHome = predictOne(out, match, optimResult);
    const correct  = predHome===(match.a_wins===1);
    if (!bySeason[match.season]) bySeason[match.season]={bets:0,wins:0,pnl:0};

    const date = match.date;
    if (!byDate[date]) byDate[date]={date,bets:0,wins:0,pnl:0,matches:[]};

    // Build per-book bets for this match
    const matchBets = [];
    let matchPnl = 0, matchBetCount = 0;

    bookmakers.forEach(book => {
      if (!match.odds?.[book]) return;
      const betOdds = predHome?match.odds[book].home:match.odds[book].away;
      if (C.enabled && (betOdds > C.maxOdds || betOdds < C.minOdds)) return;

      let stake;
      if (strategy==='fixed') {
        stake = stakePerBet;
        if (stake<=0||bankroll<=0) return;
      } else {
        // Kelly requires a reference probability — skip if unavailable
        if (!match.no_vig_ref) return;
        const p = predHome ? match.no_vig_ref.home : match.no_vig_ref.away;
        const b = betOdds - 1;
        if (b <= 0) return;
        // Kelly fraction: (p*b - (1-p)) / b
        const fk = (p * b - (1 - p)) / b;
        if (fk <= 0) return;  // Kelly says no edge → don't bet
        const fraction = C.enabled ? C.flatKellyFraction : 0.25;
        stake = bankroll * fk * fraction;
        const cap = C.enabled ? C.maxStakePct / 100 : 0.05;
        stake = Math.min(stake, bankroll * cap);
        // No artificial floor in Kelly mode — if Kelly says tiny bet, bet tiny
        if (stake <= 0 || bankroll <= 0) return;
      }
      stake = Math.min(stake, bankroll * 0.95);

      totalBets++; totalOddsSum+=betOdds; matchBetCount++;
      byBook[book].bets++; bySeason[match.season].bets++;
      byDate[date].bets++;

      const pnl = correct ? stake*(betOdds-1) : -stake;
      matchPnl += pnl;

      if (correct) {
        totalWins++; totalPnL+=pnl; bankroll+=pnl; grossWins+=pnl;
        byBook[book].wins++; byBook[book].pnl+=pnl;
        bySeason[match.season].wins++; bySeason[match.season].pnl+=pnl;
        byDate[date].wins++; byDate[date].pnl+=pnl;
        consecLosses=0; curWS++; curLS=0; longestWS=Math.max(longestWS,curWS);
      } else {
        totalPnL+=pnl; bankroll+=pnl; grossLosses+=Math.abs(pnl);
        byBook[book].pnl+=pnl;
        bySeason[match.season].pnl+=pnl;
        byDate[date].pnl+=pnl;
        consecLosses++; curLS++; curWS=0; longestLS=Math.max(longestLS,curLS);
      }
      bankroll=Math.max(bankroll,0);

      matchBets.push({ book, betOdds, stake, pnl, correct });
    });

    if (matchBetCount > 0) {
      const matchEntry = {
        date, season: match.season,
        home: match.home_abbr, away: match.away_abbr,
        formulaOutput: +out.toFixed(4),
        threshold: +optimResult.threshold.toFixed(4),
        predHome, actualHomeWin: match.a_wins===1, correct,
        pinnacleHome: match.no_vig_ref?.home ?? null,
        bets: matchBets, pnl: matchPnl,
        eloA: +match.stats[14].toFixed(0), eloB: +match.stats[15].toFixed(0),
      };
      matchLog.push(matchEntry);
      byDate[date].matches.push(matchEntry);
    }

    if (bankroll>peak) peak=bankroll;
    const dd=(peak-bankroll)/peak;
    if (dd>maxDD) maxDD=dd;
    if ((i+1)%5===0||i===pool.length-1)
      equity.push({ date:match.date.slice(0,7), value:Math.round(bankroll*100)/100 });
  });

  // Build week aggregations
  const byWeek = {};
  Object.values(byDate).forEach(d => {
    const wk = isoWeek(d.date);
    if (!byWeek[wk]) byWeek[wk]={week:wk,bets:0,wins:0,pnl:0};
    byWeek[wk].bets+=d.bets; byWeek[wk].wins+=d.wins; byWeek[wk].pnl+=d.pnl;
  });

  const dateArr = Object.values(byDate).sort((a,b)=>a.date.localeCompare(b.date));
  const weekArr = Object.values(byWeek).sort((a,b)=>a.week.localeCompare(b.week));

  return {
    totalBets, totalWins,
    winRate:totalBets>0?totalWins/totalBets:0,
    totalPnL, roi:totalBets>0?(strategy==='kelly'?totalPnL/initialBankroll:totalPnL/(totalBets*stakePerBet)):0,
    finalBankroll:bankroll, initialBankroll, maxDrawdown:maxDD,
    longestWinStreak:longestWS, longestLoseStreak:longestLS,
    avgOdds:totalBets>0?totalOddsSum/totalBets:0,
    profitFactor:grossLosses>0?grossWins/grossLosses:null,
    gainMoyen:totalBets>0?totalPnL/totalBets:0,
    equity, stopped, stopReason, matchLog,
    byDate: dateArr, byWeek: weekArr,
    byBook: Object.entries(byBook).map(([book,s])=>({
      book, bets:s.bets, wins:s.wins,
      winRate:s.bets>0?s.wins/s.bets:0, pnl:s.pnl,
      roi:s.bets>0?(strategy==='kelly'?s.pnl/initialBankroll:s.pnl/(s.bets*stakePerBet)):0,
    })).filter(b=>b.bets>0).sort((a,b)=>b.roi-a.roi),
    bySeason: Object.entries(bySeason).map(([season,s])=>({
      season, bets:s.bets, wins:s.wins,
      winRate:s.bets>0?s.wins/s.bets:0, pnl:s.pnl,
      roi:s.bets>0?(strategy==='kelly'?s.pnl/initialBankroll:s.pnl/(s.bets*stakePerBet)):0,
    })).sort((a,b)=>a.season.localeCompare(b.season)),
  };
}

// ── Constraints panel ────────────────────────────────────────────────────────

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
function ConstraintsPanel({ constraints, onChange }) {
  const { enabled } = constraints;
  return (
    <div style={{ background:'#0d1117', border:'1px solid #21262d', borderRadius:10, padding:'12px 14px' }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:enabled?12:0 }}>
        <span style={{ fontSize:11, color:'#484f58', fontWeight:600, letterSpacing:2, textTransform:'uppercase' }}>Contraintes réelles</span>
        <button onClick={()=>onChange({...constraints,enabled:!enabled})} style={{
          padding:'4px 10px', borderRadius:5, fontSize:11, fontWeight:600, cursor:'pointer',
          background:enabled?'#0f2d10':'#0d1117',
          border:`1px solid ${enabled?'#3fb950':'#21262d'}`,
          color:enabled?'#3fb950':'#484f58',
        }}>{enabled?'✓ ON':'○ OFF'}</button>
      </div>
      {!enabled && <div style={{ fontSize:11, color:'#484f58', fontStyle:'italic', marginTop:6 }}>Activer pour limites de mise, stop-loss, filtre cotes…</div>}
      {enabled && (
        <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
          {[
            { key:'flatKellyFraction', label:'Fraction Kelly',          unit:'×', min:0.05, max:1,   step:0.05, help:'0.25 = quart-Kelly' },
            { key:'maxStakePct',       label:'Mise max % bankroll',     unit:'%', min:1,    max:20,  step:0.5,  help:'Cap par rapport à la bankroll' },
            { key:'minOdds',           label:'Cote minimale',           unit:'×', min:1.05, max:2.5, step:0.05, help:'Ignorer sous cette cote' },
            { key:'maxOdds',           label:'Cote maximale',           unit:'×', min:2,    max:20,  step:0.5,  help:'Ignorer au-dessus' },
            { key:'stopLossPct',       label:'Stop-loss bankroll',      unit:'%', min:10,   max:80,  step:5,    help:'Arrêter si perte X% de l\'initiale' },
            { key:'maxConsecLosses',   label:'Pertes consécutives max', unit:'',  min:3,    max:30,  step:1,    help:'Arrêter après X pertes consécutives' },
          ].map(({ key, label, unit, min, max, step, help }) => (
            <div key={key}>
              <div style={{ display:'flex', justifyContent:'space-between', marginBottom:2 }}>
                <span style={{ fontSize:11, color:'#8b949e' }}>{label}</span>
                <span style={{ fontSize:12, color:'#f59e0b', fontFamily:'monospace', fontWeight:600 }}>{constraints[key]}{unit}</span>
              </div>
              <input type="range" min={min} max={max} step={step} value={constraints[key]}
                onChange={e=>onChange({...constraints,[key]:parseFloat(e.target.value)})}
                style={{ width:'100%', accentColor:'#f59e0b' }} />
              <div style={{ fontSize:10, color:'#484f58' }}>{help}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Day drilldown modal ───────────────────────────────────────────────────────
function DayDrilldown({ date, matches: dayMatches, onClose }) {
  const totalPnl = dayMatches.reduce((s,m)=>s+m.pnl,0);
  const totalBets = dayMatches.reduce((s,m)=>s+m.bets.length,0);
  const wins = dayMatches.reduce((s,m)=>s+(m.correct?1:0),0);

  return (
    <div style={{
      position:'fixed', inset:0, background:'rgba(0,0,0,0.7)', zIndex:1000,
      display:'flex', alignItems:'center', justifyContent:'center', padding:32,
    }} onClick={onClose}>
      <div style={{
        background:'#0d1117', border:'1px solid #30363d', borderRadius:14,
        width:'min(900px,90vw)', maxHeight:'85vh', display:'flex', flexDirection:'column',
        overflow:'hidden',
      }} onClick={e=>e.stopPropagation()}>
        {/* Header */}
        <div style={{ padding:'16px 20px', borderBottom:'1px solid #21262d', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <div>
            <div style={{ fontSize:16, fontWeight:700, color:'#e6edf3' }}>📅 {date}</div>
            <div style={{ fontSize:12, color:'#484f58', marginTop:2 }}>
              {dayMatches.length} matchs · {totalBets} paris · {wins}/{dayMatches.length} prédictions correctes
              <span style={{ marginLeft:12, fontWeight:600, color:pnlC(totalPnl) }}>{eur(totalPnl)}</span>
            </div>
          </div>
          <button onClick={onClose} style={{ background:'none', border:'1px solid #30363d', borderRadius:6, color:'#8b949e', padding:'6px 12px', cursor:'pointer', fontSize:13 }}>✕ Fermer</button>
        </div>

        {/* Match list */}
        <div style={{ overflowY:'auto', padding:'16px 20px', display:'flex', flexDirection:'column', gap:12 }}>
          {dayMatches.map((m, i) => (
            <div key={i} style={{
              background:'#0a0e18', border:`1px solid ${m.correct?'#1a3a1a':'#3a1a1a'}`,
              borderRadius:10, padding:'14px 16px',
            }}>
              {/* Match header */}
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:10 }}>
                <div>
                  <div style={{ fontSize:14, fontWeight:700, color:'#e6edf3', marginBottom:4 }}>
                    <span style={{ color:'#60a5fa' }}>{m.home}</span>
                    <span style={{ color:'#484f58', margin:'0 8px' }}>vs</span>
                    <span style={{ color:'#fb923c' }}>{m.away}</span>
                  </div>
                  <div style={{ display:'flex', gap:12, fontSize:11, color:'#484f58' }}>
                    <span>Elo home: <span style={{ color:'#8b949e', fontFamily:'monospace' }}>{m.eloA}</span></span>
                    <span>Elo away: <span style={{ color:'#8b949e', fontFamily:'monospace' }}>{m.eloB}</span></span>
                    {m.pinnacleHome && <span>Pinnacle home: <span style={{ color:'#8b949e', fontFamily:'monospace' }}>{pct(m.pinnacleHome)}</span></span>}
                  </div>
                </div>
                <div style={{ textAlign:'right' }}>
                  <div style={{ fontSize:16, fontWeight:700, color:pnlC(m.pnl), fontFamily:'monospace' }}>{eur(m.pnl)}</div>
                  <div style={{ fontSize:11, color:m.correct?'#3fb950':'#f85149', marginTop:2 }}>
                    {m.correct ? '✓ Correct' : '✗ Incorrect'}
                  </div>
                </div>
              </div>

              {/* Formula output */}
              <div style={{ display:'flex', gap:16, marginBottom:10, padding:'8px 12px', background:'#161b22', borderRadius:6, flexWrap:'wrap' }}>
                <div style={{ fontSize:11, color:'#484f58' }}>
                  Formule: <span style={{ fontFamily:'monospace', color:'#f59e0b', fontWeight:600 }}>{m.formulaOutput}</span>
                </div>
                <div style={{ fontSize:11, color:'#484f58' }}>
                  Threshold: <span style={{ fontFamily:'monospace', color:'#8b949e' }}>{m.threshold > 0 ? '+' : ''}{m.threshold}</span>
                </div>
                <div style={{ fontSize:11, color:'#484f58' }}>
                  Prédit: <span style={{ fontWeight:600, color:m.predHome?'#60a5fa':'#fb923c' }}>
                    {m.predHome ? `${m.home} (home)` : `${m.away} (away)`}
                  </span>
                </div>
                <div style={{ fontSize:11, color:'#484f58' }}>
                  Résultat: <span style={{ fontWeight:600, color:m.actualHomeWin?'#60a5fa':'#fb923c' }}>
                    {m.actualHomeWin ? `${m.home} gagne` : `${m.away} gagne`}
                  </span>
                </div>
              </div>

              {/* Per-book bets */}
              {m.bets.length > 0 && (
                <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
                  {m.bets.map((b, j) => (
                    <div key={j} style={{
                      padding:'4px 10px', borderRadius:5, fontSize:11,
                      background: b.correct ? '#0f2d10' : '#1a0000',
                      border:`1px solid ${b.correct?'#3fb950':'#5a1a1a'}`,
                      color: b.correct ? '#3fb950' : '#f85149',
                      fontFamily:'monospace',
                    }}>
                      {bookLabel(b.book)} ×{b.betOdds.toFixed(2)} → {eur(b.pnl)}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Calendar analysis section ─────────────────────────────────────────────────
function CalendarAnalysis({ byDate, byWeek }) {
  const [view,        setView]        = useState('days');  // 'days' | 'weeks'
  const [drillDate,   setDrillDate]   = useState(null);
  const [showAll,     setShowAll]     = useState(false);

  const sortedDays  = useMemo(() => [...byDate].sort((a,b)=>b.pnl-a.pnl), [byDate]);
  const sortedWeeks = useMemo(() => [...byWeek].sort((a,b)=>b.pnl-a.pnl), [byWeek]);

  const N_DISPLAY = 10;
  const topDays    = sortedDays.slice(0, N_DISPLAY);
  const worstDays  = sortedDays.slice(-N_DISPLAY).reverse();
  const topWeeks   = sortedWeeks.slice(0, N_DISPLAY);
  const worstWeeks = sortedWeeks.slice(-N_DISPLAY).reverse();

  // Daily P&L chart data
  const chartData = useMemo(() => byDate.map(d => ({
    date: d.date.slice(5),   // MM-DD
    pnl:  +d.pnl.toFixed(2),
    bets: d.bets,
  })), [byDate]);

  const drillData = drillDate ? byDate.find(d=>d.date===drillDate) : null;

  return (
    <div style={{ background:'#0d1117', border:'1px solid #21262d', borderRadius:12, padding:'18px 20px' }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16, flexWrap:'wrap', gap:8 }}>
        <div style={{ fontSize:13, fontWeight:600, color:'#e6edf3' }}>Analyse calendaire</div>
        <div style={{ display:'flex', gap:6 }}>
          {[['days','Par jour'],['weeks','Par semaine']].map(([k,l])=>(
            <button key={k} onClick={()=>setView(k)} style={{
              padding:'5px 12px', borderRadius:5, fontSize:11, fontWeight:600, cursor:'pointer',
              background:view===k?'#132b50':'#0d1117',
              border:`1px solid ${view===k?'#60a5fa':'#21262d'}`,
              color:view===k?'#60a5fa':'#8b949e',
            }}>{l}</button>
          ))}
        </div>
      </div>

      {/* P&L bar chart */}
      {view === 'days' && chartData.length > 0 && (
        <div style={{ marginBottom:16 }}>
          <div style={{ fontSize:11, color:'#484f58', marginBottom:8 }}>P&L par jour — cliquer sur une barre pour le détail</div>
          <ResponsiveContainer width="100%" height={140}>
            <BarChart data={chartData} margin={{ top:4, right:4, left:-20, bottom:4 }}
              onClick={e => {
                if (e?.activePayload?.[0]) {
                  const idx = e.activeIndex;
                  if (byDate[idx]) setDrillDate(byDate[idx].date);
                }
              }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#21262d" />
              <XAxis dataKey="date" tick={{ fontSize:9, fill:'#484f58' }} interval={Math.max(1,Math.floor(chartData.length/20))} />
              <YAxis tick={{ fontSize:9, fill:'#484f58' }} tickFormatter={v=>`${v.toFixed(0)}€`} width={50} />
              <Tooltip contentStyle={TOOLTIP_S}
                formatter={(v,_,p)=>[`${eur(v)}  (${p.payload.bets} paris)`, 'P&L']}
                labelFormatter={l=>`Date: ${l}`}
              />
              <ReferenceLine y={0} stroke="#484f58" />
              <Bar dataKey="pnl" radius={[2,2,0,0]} cursor="pointer">
                {chartData.map((d,i)=><Cell key={i} fill={d.pnl>=0?'#3fb950':'#f85149'} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Best/Worst tables */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16 }}>

        {/* Meilleurs */}
        <div>
          <div style={{ fontSize:11, color:'#3fb950', fontWeight:600, marginBottom:8 }}>
            🏆 Meilleurs {view==='days'?'jours':'semaines'}
          </div>
          <div style={{ display:'flex', flexDirection:'column', gap:3 }}>
            {(view==='days' ? topDays : topWeeks).map((item,i) => (
              <div key={i}
                onClick={() => view==='days' && setDrillDate(item.date)}
                style={{
                  display:'flex', justifyContent:'space-between', alignItems:'center',
                  padding:'6px 10px', borderRadius:6, fontSize:11,
                  background:'#0f2d10', border:'1px solid #1a4a1a',
                  cursor:view==='days'?'pointer':'default',
                }}
                onMouseEnter={e=>{if(view==='days')e.currentTarget.style.borderColor='#3fb950';}}
                onMouseLeave={e=>{if(view==='days')e.currentTarget.style.borderColor='#1a4a1a';}}
              >
                <div>
                  <span style={{ color:'#8b949e', fontFamily:'monospace' }}>{view==='days'?item.date:item.week}</span>
                  <span style={{ color:'#484f58', marginLeft:8 }}>{item.bets} paris · {item.wins}/{item.bets}</span>
                </div>
                <span style={{ color:'#3fb950', fontWeight:700, fontFamily:'monospace' }}>{eur(item.pnl)}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Pires */}
        <div>
          <div style={{ fontSize:11, color:'#f85149', fontWeight:600, marginBottom:8 }}>
            💀 Pires {view==='days'?'jours':'semaines'}
          </div>
          <div style={{ display:'flex', flexDirection:'column', gap:3 }}>
            {(view==='days' ? worstDays : worstWeeks).map((item,i) => (
              <div key={i}
                onClick={() => view==='days' && setDrillDate(item.date)}
                style={{
                  display:'flex', justifyContent:'space-between', alignItems:'center',
                  padding:'6px 10px', borderRadius:6, fontSize:11,
                  background:'#1a0000', border:'1px solid #3a1a1a',
                  cursor:view==='days'?'pointer':'default',
                }}
                onMouseEnter={e=>{if(view==='days')e.currentTarget.style.borderColor='#f85149';}}
                onMouseLeave={e=>{if(view==='days')e.currentTarget.style.borderColor='#3a1a1a';}}
              >
                <div>
                  <span style={{ color:'#8b949e', fontFamily:'monospace' }}>{view==='days'?item.date:item.week}</span>
                  <span style={{ color:'#484f58', marginLeft:8 }}>{item.bets} paris · {item.wins}/{item.bets}</span>
                </div>
                <span style={{ color:'#f85149', fontWeight:700, fontFamily:'monospace' }}>{eur(item.pnl)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {view==='days' && (
        <div style={{ marginTop:10, fontSize:11, color:'#484f58' }}>
          Cliquer sur un jour pour voir le détail des matchs.
        </div>
      )}

      {/* Drilldown modal */}
      {drillDate && drillData && (
        <DayDrilldown
          date={drillDate}
          matches={drillData.matches}
          onClose={() => setDrillDate(null)}
        />
      )}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function BettingSimulator({ matches, sharedOpcodes, threshModStat=-1, quantileMode=false }) {
  const { opcodes, stackHeight, isComplete, partialStack, results:fRes, push, undo, clear, loadOpcodes } =
    useFormula(matches, threshModStat, quantileMode);

  const [params, setParams] = useState({
    seasons:       [...ALL_SEASONS],
    bookmakers:    ['pinnacle','winamax_fr','betclic_fr'],
    strategy:      'fixed',
    initialBankroll: 1000,
    stakePerBet:   10,
    activeFilters: [],
    confidence:    'all',
    constraints:   { ...DEFAULT_CONSTRAINTS },
  });

  useEffect(() => {
    if (sharedOpcodes?.length>0) loadOpcodes(sharedOpcodes);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const result = useMemo(() => {
    if (!isComplete||!opcodes.length) return null;
    return runSimulation(opcodes, params, matches, threshModStat, quantileMode);
  }, [isComplete, opcodes, params, matches, threshModStat, quantileMode]);

  const toggle = (arr,val) => arr.includes(val)?arr.filter(x=>x!==val):[...arr,val];
  const set    = (key,val) => setParams(p=>({...p,[key]:val}));
  const pnlColor = result&&!result.empty?(result.totalPnL>=0?'#3fb950':'#f85149'):'#8b949e';

  return (
    <div style={{ display:'flex', height:'100%', overflow:'hidden' }}>

      {/* ── Left panel ── */}
      <div style={{ width:400, minWidth:400, flexShrink:0, borderRight:'1px solid #21262d', overflowY:'auto', padding:'20px 18px' }}>
        <div style={{ marginBottom:16 }}>
          <div style={{ fontSize:18, fontWeight:700, color:'#e6edf3', marginBottom:2 }}>Betting Simulator</div>
          <div style={{ fontSize:12, color:'#484f58' }}>{matches.filter(m=>m.has_odds).length} matchs avec cotes</div>
        </div>

        {sharedOpcodes?.length>0&&(
          <div style={{ marginBottom:14, background:'#0f2d10', border:'1px solid #3fb950', borderRadius:8, padding:'10px 14px' }}>
            <div style={{ fontSize:11, color:'#3fb950', fontWeight:600, marginBottom:6 }}>FORMULE DU PLAYGROUND</div>
            <div style={{ fontSize:11, color:'#8b949e', fontFamily:"'JetBrains Mono', monospace", marginBottom:8, wordBreak:'break-all' }}>{formulaToStr(sharedOpcodes)}</div>
            <button onClick={()=>loadOpcodes(sharedOpcodes)} style={{ width:'100%', padding:'7px', borderRadius:6, fontSize:12, fontWeight:600, background:'#132b50', border:'1px solid #60a5fa', color:'#60a5fa', cursor:'pointer' }}>← Charger cette formule</button>
          </div>
        )}

        <Calculator opcodes={opcodes} stackHeight={stackHeight} isComplete={isComplete}
          partialStack={partialStack} results={fRes} onPush={push} onUndo={undo} onClear={clear} onLoad={loadOpcodes}
          threshModStat={threshModStat} quantileMode={quantileMode} />

        <div style={{ marginTop:16, display:'flex', flexDirection:'column', gap:10 }}>

          {/* Saisons */}
          <div style={{ background:'#0d1117', border:'1px solid #21262d', borderRadius:10, padding:'12px 14px' }}>
            <div style={{ fontSize:11, color:'#484f58', fontWeight:600, letterSpacing:2, textTransform:'uppercase', marginBottom:8 }}>Saisons</div>
            <div style={{ display:'flex', gap:5, flexWrap:'wrap' }}>
              {ALL_SEASONS.map(s=>(
                <button key={s} onClick={()=>set('seasons',toggle(params.seasons,s))} style={{
                  padding:'4px 8px', borderRadius:5, fontSize:11, fontWeight:600, cursor:'pointer',
                  background:params.seasons.includes(s)?'#132b50':'#0d1117',
                  border:`1px solid ${params.seasons.includes(s)?'#60a5fa':'#21262d'}`,
                  color:params.seasons.includes(s)?'#60a5fa':'#484f58',
                }}>{s}</button>
              ))}
            </div>
          </div>

          {/* Bookmakers */}
          <div style={{ background:'#0d1117', border:'1px solid #21262d', borderRadius:10, padding:'12px 14px' }}>
            <div style={{ fontSize:11, color:'#484f58', fontWeight:600, letterSpacing:2, textTransform:'uppercase', marginBottom:6, display:'flex', justifyContent:'space-between' }}>
              <span>Bookmakers</span>
              <button onClick={()=>set('bookmakers',params.bookmakers.length===ALL_BOOKS.length?[]:[...ALL_BOOKS])}
                style={{ fontSize:10, color:'#60a5fa', background:'none', border:'none', cursor:'pointer' }}>
                {params.bookmakers.length===ALL_BOOKS.length?'Tout décocher':'Tout cocher'}
              </button>
            </div>
            <div style={{ display:'flex', flexWrap:'wrap', gap:4, maxHeight:120, overflowY:'auto' }}>
              {ALL_BOOKS.map(b=>(
                <button key={b} onClick={()=>set('bookmakers',toggle(params.bookmakers,b))} style={{
                  padding:'3px 7px', borderRadius:4, fontSize:10, cursor:'pointer',
                  background:params.bookmakers.includes(b)?'#0f2d10':'#0d1117',
                  border:`1px solid ${params.bookmakers.includes(b)?'#3fb950':'#21262d'}`,
                  color:params.bookmakers.includes(b)?'#3fb950':'#484f58',
                }}>{bookLabel(b)}</button>
              ))}
            </div>
          </div>

          {/* Stratégie + Mise séparée de la bankroll */}
          <div style={{ background:'#0d1117', border:'1px solid #21262d', borderRadius:10, padding:'12px 14px' }}>
            <div style={{ fontSize:11, color:'#484f58', fontWeight:600, letterSpacing:2, textTransform:'uppercase', marginBottom:8 }}>Stratégie & Mises</div>
            <div style={{ display:'flex', gap:6, marginBottom:12 }}>
              {[['fixed','Mise fixe'],['kelly','Quart-Kelly']].map(([k,l])=>(
                <button key={k} onClick={()=>set('strategy',k)} style={{
                  flex:1, padding:'7px', borderRadius:6, fontSize:12, fontWeight:600, cursor:'pointer',
                  background:params.strategy===k?'#132b50':'#0d1117',
                  border:`1px solid ${params.strategy===k?'#60a5fa':'#21262d'}`,
                  color:params.strategy===k?'#60a5fa':'#484f58',
                }}>{l}</button>
              ))}
            </div>
            {params.strategy==='kelly'&&(
              <div style={{ fontSize:11, color:'#f59e0b', marginBottom:10 }}>
                ⚠️ Kelly utilise Pinnacle no-vig comme référence.
              </div>
            )}
            {/* Bankroll initiale */}
            <div style={{ marginBottom:10 }}>
              <div style={{ fontSize:11, color:'#8b949e', marginBottom:5 }}>
                Bankroll initiale (€) — capital de départ
              </div>
              <div style={{ display:'flex', gap:6, alignItems:'center' }}>
                <input type="number" min={1} value={params.initialBankroll}
                  onChange={e=>set('initialBankroll',Math.max(1,Number(e.target.value)))}
                  style={{ flex:1, padding:'7px 10px', borderRadius:6, fontSize:13,
                    background:'#161b22', border:'1px solid #30363d', color:'#e6edf3',
                    fontFamily:"'JetBrains Mono', monospace" }} />
                <span style={{ fontSize:12, color:'#484f58' }}>€</span>
              </div>
            </div>
            {/* Mise par pari (fixed only) */}
            {params.strategy==='fixed' && (
              <div>
                <div style={{ fontSize:11, color:'#8b949e', marginBottom:5 }}>
                  Mise par pari (€) — montant fixe par match
                </div>
                <div style={{ display:'flex', gap:6, alignItems:'center' }}>
                  <input type="number" min={0.5} step={0.5} value={params.stakePerBet}
                    onChange={e=>set('stakePerBet',Math.max(0.5,Number(e.target.value)))}
                    style={{ flex:1, padding:'7px 10px', borderRadius:6, fontSize:13,
                      background:'#161b22', border:'1px solid #30363d', color:'#e6edf3',
                      fontFamily:"'JetBrains Mono', monospace" }} />
                  <span style={{ fontSize:12, color:'#484f58' }}>€</span>
                </div>
                <div style={{ fontSize:10, color:'#484f58', marginTop:4 }}>
                  = {params.stakePerBet>0?((params.stakePerBet/params.initialBankroll)*100).toFixed(1):0}% de la bankroll initiale
                </div>
              </div>
            )}
            {params.strategy==='kelly' && (
              <div style={{ fontSize:11, color:'#484f58', fontStyle:'italic' }}>
                La mise Kelly est calculée dynamiquement en fraction de la bankroll courante.
              </div>
            )}
          </div>

          {/* Filtres matchs */}
          <div style={{ background:'#0d1117', border:'1px solid #21262d', borderRadius:10, padding:'12px 14px' }}>
            <div style={{ fontSize:11, color:'#484f58', fontWeight:600, letterSpacing:2, textTransform:'uppercase', marginBottom:8, display:'flex', justifyContent:'space-between' }}>
              <span>Filtres de matchs (AND)</span>
              {params.activeFilters.length>0&&<button onClick={()=>set('activeFilters',[])} style={{ fontSize:10, color:'#f85149', background:'none', border:'none', cursor:'pointer' }}>Effacer</button>}
            </div>
            {FILTER_CATS.map(cat=>(
              <div key={cat} style={{ marginBottom:6 }}>
                <div style={{ fontSize:10, color:'#484f58', fontWeight:600, marginBottom:3, textTransform:'uppercase', letterSpacing:1 }}>{cat}</div>
                <div style={{ display:'flex', flexWrap:'wrap', gap:3 }}>
                  {MATCH_FILTERS.filter(f=>f.cat===cat).map(f=>{
                    const active=params.activeFilters.includes(f.id);
                    return (
                      <button key={f.id} onClick={()=>set('activeFilters',toggle(params.activeFilters,f.id))} style={{
                        padding:'3px 7px', borderRadius:4, fontSize:10, cursor:'pointer',
                        background:active?'#132b50':'#0d1117',
                        border:`1px solid ${active?'#60a5fa':'#21262d'}`,
                        color:active?'#60a5fa':'#484f58',
                      }}>{f.label}</button>
                    );
                  })}
                </div>
              </div>
            ))}
            <div style={{ marginTop:8, borderTop:'1px solid #21262d', paddingTop:8 }}>
              <div style={{ fontSize:11, color:'#484f58', marginBottom:6 }}>Confiance de la formule</div>
              <div style={{ display:'flex', gap:5 }}>
                {[['all','Tous'],['top25','Top 25%'],['top10','Top 10%']].map(([k,l])=>(
                  <button key={k} onClick={()=>set('confidence',k)} style={{
                    flex:1, padding:'5px 4px', borderRadius:5, fontSize:10, fontWeight:600, cursor:'pointer',
                    background:params.confidence===k?'#2a1400':'#0d1117',
                    border:`1px solid ${params.confidence===k?'#f59e0b':'#21262d'}`,
                    color:params.confidence===k?'#f59e0b':'#484f58',
                  }}>{l}</button>
                ))}
              </div>
            </div>
          </div>

          <ConstraintsPanel constraints={params.constraints} onChange={c=>set('constraints',c)} />
        </div>
      </div>

      {/* ── Right panel: Results ── */}
      <div style={{ flex:1, overflowY:'auto', padding:'20px 24px' }}>
        {!isComplete ? (
          <div style={{ color:'#484f58', textAlign:'center', padding:'80px 20px', fontSize:14 }}>
            Construis ou importe une formule pour lancer la simulation.
          </div>
        ) : !result||result.empty ? (
          <div style={{ color:'#f59e0b', textAlign:'center', padding:'80px 20px', fontSize:14 }}>
            {result?.empty?'Aucun match ne correspond aux filtres.':'Calcul en cours…'}
          </div>
        ) : (
          <div style={{ display:'flex', flexDirection:'column', gap:16 }}>

            {result.stopped && (
              <div style={{ background:'#1a0d00', border:'1px solid #f59e0b', borderRadius:8, padding:'10px 16px', fontSize:12, color:'#f59e0b' }}>
                ⚠️ Simulation arrêtée : <strong>{result.stopReason}</strong>
              </div>
            )}

            <div style={{ display:'flex', justifyContent:'flex-end' }}>
              <ExportBtn
                data={{
                  params:{ strategy:params.strategy, initialBankroll:params.initialBankroll, stakePerBet:params.stakePerBet, seasons:params.seasons, bookmakers:params.bookmakers },
                  summary:{ totalBets:result.totalBets, totalWins:result.totalWins, winRate:result.winRate, totalPnL:result.totalPnL, roi:result.roi, finalBankroll:result.finalBankroll, initialBankroll:result.initialBankroll, maxDrawdown:result.maxDrawdown, longestWinStreak:result.longestWinStreak, longestLoseStreak:result.longestLoseStreak, avgOdds:result.avgOdds, profitFactor:result.profitFactor, gainMoyen:result.gainMoyen },
                  bySeason:result.bySeason, byBook:result.byBook, byDate:result.byDate, byWeek:result.byWeek,
                }}
                filename="betting_simulation.json"
                label="↓ Export JSON (Simulation)"
              />
            </div>

            {/* KPIs ligne 1 */}
            <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:12 }}>
              {[
                { label:'Paris joués',  value:result.totalBets.toLocaleString('fr-FR'), color:'#e6edf3',                     sub:`${result.totalWins} gagnés` },
                { label:'Win rate',     value:pct(result.winRate),                      color:roiC(result.winRate-0.6426),   sub:'baseline 64.26%' },
                { label:'ROI',          value:`${sign(result.roi)}${pct(result.roi)}`, color:roiC(result.roi),              sub:'par pari vs mise' },
                { label:'P&L total',    value:eur(result.totalPnL),                     color:pnlC(result.totalPnL),         sub:`vs ${result.initialBankroll.toFixed(0)}€` },
              ].map(({ label, value, color, sub }) => (
                <div key={label} style={{ background:'#0d1117', border:'1px solid #21262d', borderRadius:10, padding:'14px 16px' }}>
                  <div style={{ fontSize:11, color:'#484f58', marginBottom:5 }}>{label}</div>
                  <div style={{ fontSize:22, fontWeight:700, color, fontFamily:'monospace' }}>{value}</div>
                  <div style={{ fontSize:10, color:'#484f58', marginTop:3 }}>{sub}</div>
                </div>
              ))}
            </div>

            {/* KPIs ligne 2 */}
            <div style={{ display:'grid', gridTemplateColumns:'repeat(5,1fr)', gap:10 }}>
              {[
                { label:'Bankroll finale',     value:`${result.finalBankroll.toFixed(2)}€`,     color:pnlC(result.totalPnL) },
                { label:'Max Drawdown',        value:`-${pct(result.maxDrawdown,1)}`,           color:result.maxDrawdown>0.3?'#f85149':result.maxDrawdown>0.15?'#f59e0b':'#8b949e' },
                { label:'Plus longue série +', value:`${result.longestWinStreak} consécutifs`,  color:'#3fb950' },
                { label:'Plus longue série −', value:`${result.longestLoseStreak} consécutifs`, color:'#f85149' },
                { label:'Cote moyenne',        value:`×${result.avgOdds.toFixed(3)}`,           color:'#8b949e' },
              ].map(({ label, value, color }) => (
                <div key={label} style={{ background:'#0d1117', border:'1px solid #21262d', borderRadius:8, padding:'10px 12px' }}>
                  <div style={{ fontSize:10, color:'#484f58', marginBottom:4 }}>{label}</div>
                  <div style={{ fontSize:14, fontWeight:700, color, fontFamily:'monospace' }}>{value}</div>
                </div>
              ))}
            </div>

            {/* Profit Factor + Gain moyen */}
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
              <div style={{ background:'#0d1117', border:'1px solid #21262d', borderRadius:8, padding:'10px 14px' }}>
                <div style={{ fontSize:10, color:'#484f58', marginBottom:4 }}>Profit Factor</div>
                <div style={{ fontSize:18, fontWeight:700, fontFamily:'monospace',
                  color:result.profitFactor==null?'#484f58':result.profitFactor>1.5?'#3fb950':result.profitFactor>1?'#f59e0b':'#f85149' }}>
                  {result.profitFactor!=null?result.profitFactor.toFixed(2):'—'}
                </div>
                <div style={{ fontSize:10, color:'#484f58', marginTop:2 }}>Gains bruts / Pertes brutes · &gt;1.5 = bon</div>
              </div>
              <div style={{ background:'#0d1117', border:'1px solid #21262d', borderRadius:8, padding:'10px 14px' }}>
                <div style={{ fontSize:10, color:'#484f58', marginBottom:4 }}>Gain moyen par pari</div>
                <div style={{ fontSize:18, fontWeight:700, fontFamily:'monospace', color:pnlC(result.gainMoyen) }}>
                  {result.totalBets>0?eur(result.gainMoyen):'—'}
                </div>
                <div style={{ fontSize:10, color:'#484f58', marginTop:2 }}>En € absolus par pari joué</div>
              </div>
            </div>

            {/* Equity curve */}
            <div style={{ background:'#0d1117', border:'1px solid #21262d', borderRadius:12, padding:'18px 20px' }}>
              <div style={{ fontSize:11, color:'#484f58', fontWeight:600, letterSpacing:2, textTransform:'uppercase', marginBottom:14 }}>Évolution de la bankroll</div>
              <ResponsiveContainer width="100%" height={220}>
                <AreaChart data={result.equity} margin={{ top:5, right:10, left:0, bottom:5 }}>
                  <defs>
                    <linearGradient id="bankGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor={pnlColor} stopOpacity={0.3} />
                      <stop offset="95%" stopColor={pnlColor} stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#21262d" />
                  <XAxis dataKey="date" tick={{ fontSize:10, fill:'#8b949e' }} interval={Math.floor(result.equity.length/8)} />
                  <YAxis tick={{ fontSize:10, fill:'#8b949e' }} tickFormatter={v=>`${v.toFixed(0)}€`} width={70} />
                  <Tooltip contentStyle={TOOLTIP_S} formatter={v=>[`${v.toFixed(2)}€`,'Bankroll']} />
                  <ReferenceLine y={result.initialBankroll} stroke="#484f58" strokeDasharray="4 2"
                    label={{ value:'Initial', fill:'#484f58', fontSize:10, position:'right' }} />
                  <Area type="monotone" dataKey="value" stroke={pnlColor} strokeWidth={2} fill="url(#bankGrad)" dot={false} />
                </AreaChart>
              </ResponsiveContainer>
            </div>

            {/* Analyse calendaire */}
            {result.byDate.length > 0 && (
              <CalendarAnalysis byDate={result.byDate} byWeek={result.byWeek} />
            )}

            {/* Par bookmaker */}
            {result.byBook.length>1&&(
              <div style={{ background:'#0d1117', border:'1px solid #21262d', borderRadius:12, overflow:'hidden' }}>
                <div style={{ padding:'12px 20px', borderBottom:'1px solid #21262d', fontSize:13, fontWeight:600, color:'#e6edf3' }}>Par bookmaker</div>
                <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
                  <thead>
                    <tr style={{ borderBottom:'1px solid #21262d' }}>
                      {['Bookmaker','Paris','Win rate','P&L','ROI'].map(h=>(
                        <th key={h} style={{ padding:'7px 12px', textAlign:h==='Bookmaker'?'left':'right', color:'#484f58', fontSize:11 }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {result.byBook.map((bk,i)=>(
                      <tr key={bk.book} style={{ borderTop:'1px solid #161b22', background:i%2===0?'#0a0e18':'transparent' }}>
                        <td style={{ padding:'6px 12px', color:'#e6edf3', fontSize:12 }}>
                          {bookLabel(bk.book)}
                          {SHARP_BOOKS.has(bk.book)&&<span style={{ marginLeft:6, fontSize:9, background:'#132b50', color:'#60a5fa', padding:'1px 5px', borderRadius:3, fontWeight:700 }}>SHARP</span>}
                        </td>
                        <td style={{ padding:'6px 12px', textAlign:'right', color:'#8b949e' }}>{bk.bets}</td>
                        <td style={{ padding:'6px 12px', textAlign:'right', fontFamily:'monospace', color:roiC(bk.winRate-0.6426) }}>{pct(bk.winRate)}</td>
                        <td style={{ padding:'6px 12px', textAlign:'right', fontFamily:'monospace', color:pnlC(bk.pnl) }}>{eur(bk.pnl)}</td>
                        <td style={{ padding:'6px 12px', textAlign:'right', fontFamily:'monospace', fontWeight:600, color:roiC(bk.roi) }}>{sign(bk.roi)}{pct(bk.roi)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Par saison */}
            <div style={{ background:'#0d1117', border:'1px solid #21262d', borderRadius:12, overflow:'hidden' }}>
              <div style={{ padding:'12px 20px', borderBottom:'1px solid #21262d', fontSize:13, fontWeight:600, color:'#e6edf3' }}>Par saison</div>
              <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
                <thead>
                  <tr style={{ borderBottom:'1px solid #21262d' }}>
                    {['Saison','Paris','Win rate','P&L','ROI'].map(h=>(
                      <th key={h} style={{ padding:'7px 12px', textAlign:h==='Saison'?'left':'right', color:'#484f58', fontSize:11 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {result.bySeason.map((s,i)=>(
                    <tr key={s.season} style={{ borderTop:'1px solid #161b22', background:i%2===0?'#0a0e18':'transparent' }}>
                      <td style={{ padding:'6px 12px', color:'#e6edf3', fontFamily:'monospace' }}>{s.season}</td>
                      <td style={{ padding:'6px 12px', textAlign:'right', color:'#8b949e' }}>{s.bets}</td>
                      <td style={{ padding:'6px 12px', textAlign:'right', fontFamily:'monospace', color:roiC(s.winRate-0.6426) }}>{pct(s.winRate)}</td>
                      <td style={{ padding:'6px 12px', textAlign:'right', fontFamily:'monospace', color:pnlC(s.pnl) }}>{eur(s.pnl)}</td>
                      <td style={{ padding:'6px 12px', textAlign:'right', fontFamily:'monospace', fontWeight:600, color:roiC(s.roi) }}>{sign(s.roi)}{pct(s.roi)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div style={{ background:'#0a0e18', border:'1px solid #1c2236', borderRadius:8, padding:'12px 16px' }}>
              <div style={{ fontSize:11, color:'#484f58', lineHeight:1.6 }}>
                <span style={{ color:'#f59e0b', fontWeight:600 }}>⚠️ In-sample : </span>
                Threshold optimisé sur le même dataset. Résultats optimistes — valider sur futures données.
                {' '}<span style={{ color:'#3fb950' }}>Profit Factor &gt; 1.5</span> et
                {' '}<span style={{ color:'#f85149' }}>Max Drawdown &lt; 20%</span> = signaux de robustesse.
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
