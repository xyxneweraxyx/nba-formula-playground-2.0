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

// Sharp books / exchanges — jamais restreints dans la réalité
// Sources: OddsMonkey, RebelBetting, SBR forums, UK GC 2025 report (4.31% comptes restreints, 46.78% en profit)
const SHARP_SET = new Set(['pinnacle','betfair_ex_eu','matchbook','betfair']);

// ── Modes de simulation réalistes ────────────────────────────────────────────
// Basés sur: témoignages (Betsson limité après 2 paris de 80€, WilliamHill après 2 paris de 200€,
// Bet365 après 30 paris de 200-500€), UK GC 2025, forums SBR, RebelBetting community
const MODES = {
  recreatif: {
    label:'🎭 Récréatif', color:'#8b949e',
    description:'Petit parieur, mises modestes, restrictions rapides. Scénario très courant.',
    bookRestrictionsEnabled:true,
    softLimitTrigger:300,      // €300 nets/book → restriction (10-30 paris gagnants)
    postSoftLimitMaxStake:8,   // €8/pari max après restriction
    hardLimitTrigger:800,      // €800 nets → compte fermé
    maxExposurePerMatch:100,   // €100 max sur un match (tous books)
    maxExposurePerDay:300,     // €300/jour max
    maxStakePerBet:50,         // €50 max/pari — typique petit parieur
    minOdds:1.10, maxOdds:5.0,
    maxPayoutPerBet:5000,      // €5k gain max/pari
    stopLossPct:80, maxConsecLosses:100,
    taxEnabled:false, taxRate:20, taxThreshold:10000,
  },
  realiste: {
    label:'📊 Réaliste', color:'#60a5fa',
    description:'Parieur régulier — scénario le plus probable selon les témoignages de la communauté.',
    bookRestrictionsEnabled:true,
    softLimitTrigger:800,
    postSoftLimitMaxStake:15,  // €5-15 typique selon les sources
    hardLimitTrigger:3000,
    maxExposurePerMatch:300,
    maxExposurePerDay:1500,
    maxStakePerBet:200,        // €200 = seuil "mise significative" selon les experts
    minOdds:1.05, maxOdds:8.0,
    maxPayoutPerBet:50000,
    stopLossPct:80, maxConsecLosses:100,
    taxEnabled:false, taxRate:20, taxThreshold:10000,
  },
  optimiste: {
    label:'📈 Optimiste', color:'#3fb950',
    description:'Books tolérants, restrictions tardives. Meilleur scénario réaliste.',
    bookRestrictionsEnabled:true,
    softLimitTrigger:3000,
    postSoftLimitMaxStake:25,
    hardLimitTrigger:10000,
    maxExposurePerMatch:800,
    maxExposurePerDay:5000,
    maxStakePerBet:300,
    minOdds:1.05, maxOdds:10.0,
    maxPayoutPerBet:100000,
    stopLossPct:80, maxConsecLosses:100,
    taxEnabled:false, taxRate:20, taxThreshold:10000,
  },
  pessimiste: {
    label:'💀 Pessimiste', color:'#f85149',
    description:'Books très agressifs. Betsson: limité après 2 paris de 80€. WilliamHill: après 2×200€.',
    bookRestrictionsEnabled:true,
    softLimitTrigger:150,
    postSoftLimitMaxStake:5,   // €3-5 — témoignages extrêmes
    hardLimitTrigger:400,
    maxExposurePerMatch:80,
    maxExposurePerDay:200,
    maxStakePerBet:80,
    minOdds:1.10, maxOdds:4.0,
    maxPayoutPerBet:2000,
    stopLossPct:80, maxConsecLosses:100,
    taxEnabled:false, taxRate:20, taxThreshold:10000,
  },
  sharpOnly: {
    label:'🎯 Sharp Only', color:'#f59e0b',
    description:'Pinnacle + Exchanges uniquement — jamais restreint. Sélectionner uniquement ces 4 books.',
    bookRestrictionsEnabled:false,
    softLimitTrigger:999999, postSoftLimitMaxStake:9999, hardLimitTrigger:999999,
    maxExposurePerMatch:5000,   // Pinnacle accepte ~€2-5k sur NBA
    maxExposurePerDay:20000,
    maxStakePerBet:2000,
    minOdds:1.01, maxOdds:20.0,
    maxPayoutPerBet:500000,
    stopLossPct:80, maxConsecLosses:100,
    taxEnabled:false, taxRate:20, taxThreshold:10000,
  },
  custom: {
    label:'⚙️ Custom', color:'#8b949e',
    description:'Configurez manuellement toutes les contraintes ci-dessous.',
  },
};

const DEFAULT_CONSTRAINTS = {
  mode:'realiste', enabled:true,
  ...MODES.realiste,
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

  const C = constraints?.enabled ? constraints : { ...DEFAULT_CONSTRAINTS, enabled:false };
  let bankroll=initialBankroll, peak=initialBankroll, maxDD=0;
  const equity=[{ date:'Départ', value:bankroll }];
  let totalBets=0, totalWins=0, totalPnL=0, consecLosses=0;
  let longestWS=0, longestLS=0, curWS=0, curLS=0, totalOddsSum=0;
  let grossWins=0, grossLosses=0, totalTaxPaid=0;
  let stopped=false, stopReason='';
  const byBook={}, bySeason={};
  bookmakers.forEach(b=>{byBook[b]={bets:0,wins:0,pnl:0};});

  // Per-book live restriction tracking
  const bookNetPnlLive = {};  // cumul net P&L par book (temps réel)
  const bookStatus     = {};  // 'active' | 'soft' | 'closed'
  bookmakers.forEach(b=>{ bookNetPnlLive[b]=0; bookStatus[b]='active'; });

  // Per-day exposure tracking
  const dayExposure = {};
  // Per-year P&L for taxation
  const yearlyPnl = {};

  // Per-match detail log / per-date aggregation
  const matchLog = [];
  const byDate   = {};

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
    const date     = match.date;
    const year     = date.slice(0,4);
    if (!bySeason[match.season]) bySeason[match.season]={bets:0,wins:0,pnl:0};
    if (!byDate[date])           byDate[date]={date,bets:0,wins:0,pnl:0,matches:[]};
    if (!dayExposure[date])      dayExposure[date]=0;
    if (!yearlyPnl[year])        yearlyPnl[year]=0;

    // Daily exposure cap — skip entire match if day is full
    if (C.enabled && C.maxExposurePerDay && dayExposure[date] >= C.maxExposurePerDay) return;

    const matchBets = [];
    let matchPnl=0, matchStake=0, matchBetCount=0;

    bookmakers.forEach(book => {
      if (!match.odds?.[book]) return;

      // Book closed → skip
      if (C.enabled && bookStatus[book]==='closed') return;

      const betOdds = predHome?match.odds[book].home:match.odds[book].away;

      // Odds filter
      if (C.enabled && (betOdds > C.maxOdds || betOdds < C.minOdds)) return;

      // ── Base stake ────────────────────────────────────────────────────────
      let stake;
      if (strategy==='fixed') {
        stake = stakePerBet;
      } else {
        stake = bankroll * (stakePerBet / 100);
      }

      // ── Cap: max stake per bet ────────────────────────────────────────────
      if (C.enabled && C.maxStakePerBet) stake = Math.min(stake, C.maxStakePerBet);

      // ── Cap: soft limit (book en restriction) ─────────────────────────────
      if (C.enabled && C.bookRestrictionsEnabled && bookStatus[book]==='soft') {
        stake = Math.min(stake, C.postSoftLimitMaxStake);
      }

      // ── Cap: exposure per match (tous books confondus) ────────────────────
      if (C.enabled && C.maxExposurePerMatch) {
        const rem = C.maxExposurePerMatch - matchStake;
        if (rem <= 0) return;
        stake = Math.min(stake, rem);
      }

      // ── Cap: exposure per day ─────────────────────────────────────────────
      if (C.enabled && C.maxExposurePerDay) {
        const rem = C.maxExposurePerDay - dayExposure[date];
        if (rem <= 0) return;
        stake = Math.min(stake, rem);
      }

      // ── Cap: max payout per bet ───────────────────────────────────────────
      if (C.enabled && C.maxPayoutPerBet) {
        const potentialWin = stake * (betOdds - 1);
        if (potentialWin > C.maxPayoutPerBet) stake = C.maxPayoutPerBet / (betOdds - 1);
      }

      stake = Math.min(stake, bankroll * 0.95);
      if (stake <= 0 || bankroll <= 0) return;

      // ── Execute bet ───────────────────────────────────────────────────────
      totalBets++; totalOddsSum+=betOdds; matchBetCount++;
      matchStake+=stake;
      dayExposure[date]+=stake;
      byBook[book].bets++; bySeason[match.season].bets++;
      byDate[date].bets++;

      const pnl = correct ? stake*(betOdds-1) : -stake;
      matchPnl+=pnl;

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
      bookNetPnlLive[book]+=pnl;
      yearlyPnl[year]+=pnl;

      // ── Update book restriction status (soft books uniquement) ────────────
      if (C.enabled && C.bookRestrictionsEnabled && !SHARP_SET.has(book)) {
        if (bookNetPnlLive[book] >= C.hardLimitTrigger) {
          bookStatus[book]='closed';
        } else if (bookNetPnlLive[book] >= C.softLimitTrigger && bookStatus[book]==='active') {
          bookStatus[book]='soft';
        }
      }

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

    // ── Taxation annuelle (fin d'année calendaire) ────────────────────────
    if (C.enabled && C.taxEnabled && i+1 < pool.length) {
      const nextYear = pool[i+1].date.slice(0,4);
      if (nextYear !== year && yearlyPnl[year] > C.taxThreshold) {
        const tax = (yearlyPnl[year] - C.taxThreshold) * (C.taxRate/100);
        bankroll = Math.max(0, bankroll - tax);
        totalTaxPaid += tax;
      }
    }

    if (bankroll>peak) peak=bankroll;
    const dd=(peak-bankroll)/peak;
    if (dd>maxDD) maxDD=dd;
    if ((i+1)%5===0||i===pool.length-1)
      equity.push({ date:match.date.slice(0,7), value:Math.round(bankroll*100)/100 });
  });

  // Tax sur la dernière année
  if (C.enabled && C.taxEnabled && pool.length) {
    const lastYear = pool[pool.length-1].date.slice(0,4);
    if (yearlyPnl[lastYear] > C.taxThreshold) {
      const tax = (yearlyPnl[lastYear] - C.taxThreshold) * (C.taxRate/100);
      bankroll=Math.max(0,bankroll-tax); totalTaxPaid+=tax;
    }
  }

  // Book restriction summary
  const bookRestrictions = bookmakers
    .filter(b=>bookStatus[b]!=='active')
    .map(b=>({ book:b, status:bookStatus[b], netPnl:bookNetPnlLive[b], isSharp:SHARP_SET.has(b) }));
  const nSoftLimited = bookRestrictions.filter(b=>b.status==='soft').length;
  const nClosed      = bookRestrictions.filter(b=>b.status==='closed').length;

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
    totalPnL, roi:totalBets>0?(strategy==='percent'?totalPnL/initialBankroll:totalPnL/(totalBets*stakePerBet)):0,
    finalBankroll:bankroll, initialBankroll, maxDrawdown:maxDD,
    longestWinStreak:longestWS, longestLoseStreak:longestLS,
    avgOdds:totalBets>0?totalOddsSum/totalBets:0,
    profitFactor:grossLosses>0?grossWins/grossLosses:null,
    gainMoyen:totalBets>0?totalPnL/totalBets:0,
    totalTaxPaid,
    nSoftLimited, nClosed, bookRestrictions,
    equity, stopped, stopReason, matchLog,
    byDate: dateArr, byWeek: weekArr,
    byBook: Object.entries(byBook).map(([book,s])=>({
      book, bets:s.bets, wins:s.wins,
      winRate:s.bets>0?s.wins/s.bets:0, pnl:s.pnl,
      roi:s.bets>0?(strategy==='percent'?s.pnl/initialBankroll:s.pnl/(s.bets*stakePerBet)):0,
      status:bookStatus[book], netPnlLive:bookNetPnlLive[book],
    })).filter(b=>b.bets>0).sort((a,b)=>b.roi-a.roi),
    bySeason: Object.entries(bySeason).map(([season,s])=>({
      season, bets:s.bets, wins:s.wins,
      winRate:s.bets>0?s.wins/s.bets:0, pnl:s.pnl,
      roi:s.bets>0?(strategy==='percent'?s.pnl/initialBankroll:s.pnl/(s.bets*stakePerBet)):0,
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
  const { mode='realiste', enabled=true } = constraints;

  const applyMode = (m) => {
    if (m==='custom') { onChange({...constraints, mode:'custom'}); return; }
    onChange({ ...MODES[m], mode:m, enabled:true });
  };
  const set = (key,val) => onChange({...constraints, mode:'custom', [key]:val});

  const Slider = ({ k, label, unit, min, max, step, help }) => (
    <div style={{ opacity:mode!=='custom'?0.65:1 }}>
      <div style={{ display:'flex', justifyContent:'space-between', marginBottom:2 }}>
        <span style={{ fontSize:11, color:'#8b949e' }}>{label}</span>
        <span style={{ fontSize:12, color:'#f59e0b', fontFamily:'monospace', fontWeight:600 }}>{constraints[k]}{unit}</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={constraints[k]??min}
        disabled={mode!=='custom'}
        onChange={e=>set(k,parseFloat(e.target.value))}
        style={{ width:'100%', accentColor:'#f59e0b' }} />
      <div style={{ fontSize:10, color:'#484f58' }}>{help}</div>
    </div>
  );

  const Toggle = ({ k, labelOn, labelOff }) => (
    <button onClick={()=>mode==='custom'&&set(k,!constraints[k])} style={{
      padding:'3px 10px', borderRadius:4, fontSize:10, fontWeight:600,
      cursor:mode==='custom'?'pointer':'default',
      background:constraints[k]?'#0f2d10':'#0d1117',
      border:`1px solid ${constraints[k]?'#3fb950':'#21262d'}`,
      color:constraints[k]?'#3fb950':'#484f58',
    }}>{constraints[k]?`✓ ${labelOn}`:`○ ${labelOff}`}</button>
  );

  return (
    <div style={{ background:'#0d1117', border:'1px solid #21262d', borderRadius:10, padding:'12px 14px' }}>
      <div style={{ fontSize:11, color:'#484f58', fontWeight:600, letterSpacing:2, textTransform:'uppercase', marginBottom:10 }}>Contraintes réelles</div>

      {/* ── Mode buttons ── */}
      <div style={{ marginBottom:12 }}>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:5, marginBottom:6 }}>
          {Object.entries(MODES).map(([k,m])=>(
            <button key={k} onClick={()=>applyMode(k)} style={{
              padding:'6px 4px', borderRadius:6, fontSize:10, fontWeight:600, cursor:'pointer', textAlign:'center',
              background:mode===k?'#1c2236':'#0d1117',
              border:`1px solid ${mode===k?(m.color||'#60a5fa'):'#21262d'}`,
              color:mode===k?(m.color||'#60a5fa'):'#484f58',
            }}>{m.label}</button>
          ))}
        </div>
        {mode && MODES[mode] && (
          <div style={{ fontSize:10, color:'#484f58', fontStyle:'italic', lineHeight:1.5, padding:'6px 8px', background:'#0a0e18', borderRadius:6 }}>
            {MODES[mode].description ?? 'Configurez manuellement.'}
          </div>
        )}
        {mode!=='custom' && (
          <div style={{ fontSize:10, color:'#484f58', marginTop:5, textAlign:'center' }}>
            Passer en <button onClick={()=>applyMode('custom')} style={{ background:'none', border:'none', color:'#60a5fa', cursor:'pointer', fontSize:10, padding:0 }}>⚙️ Custom</button> pour modifier les sliders
          </div>
        )}
      </div>

      {/* ── Enable toggle ── */}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:12 }}>
        <span style={{ fontSize:11, color:'#8b949e' }}>Appliquer les contraintes</span>
        <button onClick={()=>onChange({...constraints,enabled:!enabled})} style={{
          padding:'4px 10px', borderRadius:5, fontSize:11, fontWeight:600, cursor:'pointer',
          background:enabled?'#0f2d10':'#0d1117',
          border:`1px solid ${enabled?'#3fb950':'#21262d'}`,
          color:enabled?'#3fb950':'#484f58',
        }}>{enabled?'✓ ON':'○ OFF'}</button>
      </div>

      {enabled && (
        <div style={{ display:'flex', flexDirection:'column', gap:14 }}>

          {/* Restrictions par book */}
          <div style={{ borderTop:'1px solid #21262d', paddingTop:12 }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:8 }}>
              <div style={{ fontSize:11, color:'#60a5fa', fontWeight:600 }}>
                📚 Restrictions par bookmaker
                <div style={{ fontSize:10, color:'#484f58', fontWeight:400, marginTop:1 }}>Pinnacle 🎯 + Exchanges = jamais restreints</div>
              </div>
              <Toggle k="bookRestrictionsEnabled" labelOn="ON" labelOff="OFF" />
            </div>
            {constraints.bookRestrictionsEnabled && (
              <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                <Slider k="softLimitTrigger" label="Gains nets/book → restriction douce" unit="€" min={50} max={15000} step={50}
                  help={`Après ${constraints.softLimitTrigger}€ nets sur un book → max ${constraints.postSoftLimitMaxStake}€/pari`} />
                <Slider k="postSoftLimitMaxStake" label="Mise max après restriction douce" unit="€" min={2} max={100} step={1}
                  help="€5-15 typique selon témoignages (Betsson: €3-6, WilliamHill: €2-30)" />
                <Slider k="hardLimitTrigger" label="Gains nets/book → fermeture compte" unit="€" min={100} max={100000} step={100}
                  help={`Après ${constraints.hardLimitTrigger}€ nets → compte définitivement fermé`} />
              </div>
            )}
          </div>

          {/* Limites d'exposition */}
          <div style={{ borderTop:'1px solid #21262d', paddingTop:12 }}>
            <div style={{ fontSize:11, color:'#f59e0b', fontWeight:600, marginBottom:8 }}>💰 Limites d'exposition</div>
            <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
              <Slider k="maxStakePerBet" label="Mise max par pari" unit="€" min={5} max={5000} step={5}
                help="€200 = seuil 'mise significative' selon les experts. >€150 attire l'attention." />
              <Slider k="maxExposurePerMatch" label="Exposition max par match" unit="€" min={10} max={20000} step={10}
                help="Total toutes books confondues sur un même match" />
              <Slider k="maxExposurePerDay" label="Exposition max par jour" unit="€" min={50} max={50000} step={50}
                help="Total misé sur une même journée (tous books)" />
              <Slider k="maxPayoutPerBet" label="Gain max par pari" unit="€" min={500} max={500000} step={500}
                help="Cap payout — Pinnacle: ~€500k, soft books: €5-50k" />
            </div>
          </div>

          {/* Filtres cotes */}
          <div style={{ borderTop:'1px solid #21262d', paddingTop:12 }}>
            <div style={{ fontSize:11, color:'#8b949e', fontWeight:600, marginBottom:8 }}>🎯 Filtres de cotes</div>
            <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
              <Slider k="minOdds" label="Cote minimale" unit="×" min={1.00} max={2.5} step={0.05}
                help="Ignorer les très gros favoris" />
              <Slider k="maxOdds" label="Cote maximale" unit="×" min={2} max={20} step={0.5}
                help="Ignorer les très gros outsiders" />
            </div>
          </div>

          {/* Gestion du risque */}
          <div style={{ borderTop:'1px solid #21262d', paddingTop:12 }}>
            <div style={{ fontSize:11, color:'#f85149', fontWeight:600, marginBottom:8 }}>🛡️ Gestion du risque</div>
            <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
              <Slider k="stopLossPct" label="Stop-loss bankroll" unit="%" min={10} max={95} step={5}
                help="Arrêter si la bankroll descend en-dessous de (100−X)% de la bankroll initiale" />
              <Slider k="maxConsecLosses" label="Pertes consécutives max" unit="" min={3} max={200} step={1}
                help="Arrêter après X défaites consécutives" />
            </div>
          </div>

          {/* Fiscalité */}
          <div style={{ borderTop:'1px solid #21262d', paddingTop:12 }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:6 }}>
              <div style={{ fontSize:11, color:'#8b949e', fontWeight:600 }}>💸 Fiscalité</div>
              <Toggle k="taxEnabled" labelOn="ON" labelOff="OFF" />
            </div>
            <div style={{ fontSize:10, color:'#484f58', marginBottom:constraints.taxEnabled?8:0, fontStyle:'italic' }}>
              France & UK: non taxé. Allemagne/Suisse: peut être imposable.
            </div>
            {constraints.taxEnabled && (
              <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                <Slider k="taxRate" label="Taux d'imposition" unit="%" min={5} max={55} step={1}
                  help="Appliqué sur les gains nets annuels au-dessus du seuil" />
                <Slider k="taxThreshold" label="Seuil d'imposition annuel" unit="€" min={0} max={50000} step={500}
                  help="Gains en-dessous = exonéré" />
              </div>
            )}
          </div>

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
              {[['fixed','Mise fixe (€)'],['percent','% Bankroll']].map(([k,l])=>(
                <button key={k} onClick={()=>{set('strategy',k);if(k==='percent'&&params.strategy==='fixed')set('stakePerBet',2);if(k==='fixed'&&params.strategy==='percent')set('stakePerBet',10);}} style={{
                  flex:1, padding:'7px', borderRadius:6, fontSize:12, fontWeight:600, cursor:'pointer',
                  background:params.strategy===k?'#132b50':'#0d1117',
                  border:`1px solid ${params.strategy===k?'#60a5fa':'#21262d'}`,
                  color:params.strategy===k?'#60a5fa':'#484f58',
                }}>{l}</button>
              ))}
            </div>

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
            {/* Mise — adaptatif selon stratégie */}
            {params.strategy==='fixed' ? (
              <div>
                <div style={{ fontSize:11, color:'#8b949e', marginBottom:5 }}>Mise par pari (€) — montant fixe par match</div>
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
            ) : (
              <div>
                <div style={{ fontSize:11, color:'#8b949e', marginBottom:5 }}>Mise par pari (% bankroll courante)</div>
                <div style={{ display:'flex', gap:6, alignItems:'center' }}>
                  <input type="number" min={0.1} max={50} step={0.1} value={params.stakePerBet}
                    onChange={e=>set('stakePerBet',Math.min(50,Math.max(0.1,Number(e.target.value))))}
                    style={{ flex:1, padding:'7px 10px', borderRadius:6, fontSize:13,
                      background:'#161b22', border:'1px solid #30363d', color:'#e6edf3',
                      fontFamily:"'JetBrains Mono', monospace" }} />
                  <span style={{ fontSize:12, color:'#484f58' }}>%</span>
                </div>
                <div style={{ fontSize:10, color:'#484f58', marginTop:4 }}>
                  = {(params.initialBankroll * params.stakePerBet / 100).toFixed(2)}€ sur la bankroll initiale · mise variable ensuite
                </div>
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

            {/* Book restriction alert */}
            {(result.nSoftLimited>0||result.nClosed>0) && (
              <div style={{ background:'#0a1828', border:'1px solid #3b82f6', borderRadius:8, padding:'10px 16px' }}>
                <div style={{ fontSize:12, color:'#60a5fa', fontWeight:600, marginBottom:6 }}>
                  📚 Restrictions bookmakers déclenchées
                </div>
                <div style={{ display:'flex', gap:16, flexWrap:'wrap', marginBottom:8 }}>
                  {result.nSoftLimited>0&&<span style={{ fontSize:11, color:'#f59e0b' }}>⚡ {result.nSoftLimited} book(s) en restriction douce (mise plafonnée)</span>}
                  {result.nClosed>0&&<span style={{ fontSize:11, color:'#f85149' }}>🚫 {result.nClosed} compte(s) fermé(s) définitivement</span>}
                </div>
                <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
                  {result.bookRestrictions.map(b=>(
                    <span key={b.book} style={{ fontSize:10, padding:'2px 8px', borderRadius:4, background:b.status==='closed'?'#2a0a0a':'#1a1a00', border:`1px solid ${b.status==='closed'?'#f85149':'#f59e0b'}`, color:b.status==='closed'?'#f85149':'#f59e0b' }}>
                      {bookLabel(b.book)} {b.status==='closed'?'🚫':'⚡'} ({eur(b.netPnl)})
                    </span>
                  ))}
                </div>
              </div>
            )}

            {result.totalTaxPaid>0 && (
              <div style={{ background:'#0a1828', border:'1px solid #60a5fa', borderRadius:8, padding:'10px 16px', fontSize:12, color:'#60a5fa' }}>
                💸 Taxes prélevées : <strong>{eur(result.totalTaxPaid)}</strong> (inclus dans le P&L affiché)
              </div>
            )}

            <div style={{ display:'flex', justifyContent:'flex-end' }}>
              <ExportBtn
                data={{
                  params:{ strategy:params.strategy, initialBankroll:params.initialBankroll, stakePerBet:params.stakePerBet, seasons:params.seasons, bookmakers:params.bookmakers, constraints:params.constraints },
                  summary:{ totalBets:result.totalBets, totalWins:result.totalWins, winRate:result.winRate, totalPnL:result.totalPnL, roi:result.roi, finalBankroll:result.finalBankroll, initialBankroll:result.initialBankroll, maxDrawdown:result.maxDrawdown, longestWinStreak:result.longestWinStreak, longestLoseStreak:result.longestLoseStreak, avgOdds:result.avgOdds, profitFactor:result.profitFactor, gainMoyen:result.gainMoyen, totalTaxPaid:result.totalTaxPaid, nSoftLimited:result.nSoftLimited, nClosed:result.nClosed },
                  bookRestrictions:result.bookRestrictions, bySeason:result.bySeason, byBook:result.byBook, byDate:result.byDate, byWeek:result.byWeek,
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
                { label:'ROI',          value:`${sign(result.roi)}${pct(result.roi)}`, color:roiC(result.roi),              sub:params.strategy==='percent'?'retour sur bankroll initiale':'par pari vs mise' },
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
