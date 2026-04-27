// useBetting.js — V3 odds analysis with bucket-threshold support
import { evalAll, optimize, predictMatch } from '../engine';

export const SHARP_BOOKS = new Set(['pinnacle', 'betfair_ex_eu', 'matchbook', 'betfair']);

export const BOOK_LABELS = {
  pinnacle:'Pinnacle', betfair_ex_eu:'Betfair EU', betfair:'Betfair', matchbook:'Matchbook',
  winamax_fr:'Winamax FR', winamax_de:'Winamax DE', betclic_fr:'Betclic FR', betclic:'Betclic',
  unibet_fr:'Unibet FR', unibet:'Unibet', unibet_eu:'Unibet EU', unibet_nl:'Unibet NL',
  unibet_se:'Unibet SE', williamhill:'William Hill', nordicbet:'NordicBet', betsson:'Betsson',
  marathonbet:'MarathonBet', sport888:'888sport', betonlineag:'BetOnline', mybookieag:'MyBookie',
  coolbet:'Coolbet', gtbets:'GTBets', everygame:'Everygame', intertops:'Intertops',
  suprabets:'SupraBets', tipico_de:'Tipico DE', livescorebet_eu:'LiveScore Bet',
  codere_it:'Codere IT', onexbet:'1xBet', pmu_fr:'PMU FR', parionssport_fr:'Parions Sport',
  leovegas_se:'LeoVegas SE',
};
export const bookLabel = key => BOOK_LABELS[key] || key;

// ── Prediction helper (bucket-aware) ─────────────────────────────────────────
function predict(output, match, optimResult) {
  if (optimResult.threshModStat >= 0 && optimResult.bucketThresholds) {
    return predictMatch(output, match.stats, optimResult);
  }
  return output > optimResult.threshold;
}

// ── Odds analysis by bookmaker ────────────────────────────────────────────────
export function computeOddsAnalysis(opcodes, matches, threshModStat=-1, quantileMode=false) {
  if (!opcodes.length || !matches.length) return null;

  const optimResult = optimize(opcodes, matches, threshModStat, quantileMode);
  const { score: globalScore, consts } = optimResult;

  const withOdds = matches.filter(m => m.has_odds && m.odds && m.no_vig_ref);
  if (!withOdds.length) return null;

  const outputs = evalAll(opcodes, consts, withOdds);

  const books = {};
  const bySeasonGlobal = {};

  withOdds.forEach((match, i) => {
    const out      = outputs[i];
    const predHome = predict(out, match, optimResult);
    const correct  = predHome === (match.a_wins === 1);
    const pinnacleProb = predHome ? match.no_vig_ref.home : match.no_vig_ref.away;

    const s = match.season;
    if (!bySeasonGlobal[s]) bySeasonGlobal[s] = { n:0, wins:0 };
    bySeasonGlobal[s].n++;
    if (correct) bySeasonGlobal[s].wins++;

    // V3: MOV_s gap = stats[12]-stats[13]
    const gap = Math.abs(match.stats[12] - match.stats[13]);
    const gapKey = gap < 3 ? 'close' : gap < 8 ? 'medium' : 'mismatch';

    Object.entries(match.odds).forEach(([book, odds]) => {
      if (!books[book]) books[book] = {
        n:0, wins:0, oddsSum:0, impliedSum:0, roiUnits:0,
        pinnacleSum:0, pinnacleN:0,
        bySeason:{}, byGap:{close:{n:0,wins:0},medium:{n:0,wins:0},mismatch:{n:0,wins:0}},
      };
      const bk = books[book];
      const betOdds = predHome ? odds.home : odds.away;
      const implied  = 1/betOdds;

      bk.n++; bk.oddsSum+=betOdds; bk.impliedSum+=implied;
      bk.pinnacleSum+=pinnacleProb; bk.pinnacleN++;
      bk.byGap[gapKey].n++;

      if (!bk.bySeason[s]) bk.bySeason[s]={n:0,wins:0,roiUnits:0};
      bk.bySeason[s].n++;

      if (correct) {
        bk.wins++; bk.roiUnits+=betOdds-1;
        bk.byGap[gapKey].wins++;
        bk.bySeason[s].wins++; bk.bySeason[s].roiUnits+=betOdds-1;
      } else {
        bk.roiUnits-=1; bk.bySeason[s].roiUnits-=1;
      }
    });
  });

  const bookList = Object.entries(books).map(([book, bk]) => {
    const winRate        = bk.wins/bk.n;
    const avgImplied     = bk.impliedSum/bk.n;
    const avgOdds        = bk.oddsSum/bk.n;
    const avgPinnacle    = bk.pinnacleN>0 ? bk.pinnacleSum/bk.pinnacleN : null;
    const roi            = bk.roiUnits/bk.n;
    const edgeVsBook     = winRate-avgImplied;
    const edgeVsPinnacle = avgPinnacle!=null ? winRate-avgPinnacle : null;
    return {
      book, isSharp:SHARP_BOOKS.has(book), n:bk.n, wins:bk.wins, winRate, avgImplied, avgOdds,
      edgeVsBook, edgeVsPinnacle, roi, roiUnits:bk.roiUnits,
      bySeason: Object.entries(bk.bySeason).map(([season,s])=>({
        season, n:s.n, wins:s.wins,
        winRate:s.n>0?s.wins/s.n:0, roi:s.n>0?s.roiUnits/s.n:0,
      })).sort((a,b)=>a.season.localeCompare(b.season)),
      byGap: {
        close:    {...bk.byGap.close,    winRate:bk.byGap.close.n>0   ?bk.byGap.close.wins/bk.byGap.close.n:0},
        medium:   {...bk.byGap.medium,   winRate:bk.byGap.medium.n>0  ?bk.byGap.medium.wins/bk.byGap.medium.n:0},
        mismatch: {...bk.byGap.mismatch, winRate:bk.byGap.mismatch.n>0?bk.byGap.mismatch.wins/bk.byGap.mismatch.n:0},
      },
    };
  }).sort((a,b) => b.edgeVsBook-a.edgeVsBook);

  return {
    globalScore, optimResult, n:withOdds.length,
    bookmakers: bookList,
    bySeason: Object.entries(bySeasonGlobal).map(([season,s])=>({
      season, n:s.n, wins:s.wins, winRate:s.n>0?s.wins/s.n:0,
    })).sort((a,b)=>a.season.localeCompare(b.season)),
  };
}

// ── Edge analysis for EdgeAnalyser ────────────────────────────────────────────
export function computeEdgeAnalysis(opcodes, matches, threshModStat=-1, quantileMode=false) {
  if (!opcodes.length || !matches.length) return null;

  const optimResult = optimize(opcodes, matches, threshModStat, quantileMode);
  const pool = matches.filter(m => m.has_odds && m.odds && m.no_vig_ref);
  if (!pool.length) return null;

  const outputs  = evalAll(opcodes, optimResult.consts, pool);
  const allBooks = new Set();
  pool.forEach(m => Object.keys(m.odds).forEach(b => allBooks.add(b)));

  return { pool, outputs, optimResult, allBooks:[...allBooks] };
}

export function analyseSegment(pool, outputs, optimResult) {
  if (!pool.length) return null;
  const n = pool.length;
  let wins=0, roiSum=0;
  const bookStats = {};

  pool.forEach((m, i) => {
    const predHome = predict(outputs[i], m, optimResult);
    const correct  = predHome===(m.a_wins===1);
    if (correct) wins++;

    const pinn = m.no_vig_ref ? (predHome?m.no_vig_ref.home:m.no_vig_ref.away) : null;

    Object.entries(m.odds).forEach(([book, odds]) => {
      if (!bookStats[book]) bookStats[book]={n:0,wins:0,impliedSum:0,oddsSum:0,pinnSum:0,pinnN:0};
      const bk=bookStats[book], betOdds=predHome?odds.home:odds.away;
      bk.n++; bk.impliedSum+=1/betOdds; bk.oddsSum+=betOdds;
      if (pinn!=null) { bk.pinnSum+=pinn; bk.pinnN++; }
      if (correct) { bk.wins++; roiSum+=betOdds-1; } else roiSum-=1;
    });
  });

  const winRate = wins/n;
  const byBook = Object.entries(bookStats).map(([book,bk]) => {
    const wr=bk.wins/bk.n, imp=bk.impliedSum/bk.n, avg=bk.oddsSum/bk.n;
    const pnv=bk.pinnN>0?bk.pinnSum/bk.pinnN:null;
    return {
      book, n:bk.n, winRate:wr, avgImplied:imp, avgOdds:avg,
      edgeVsBook:wr-imp, edgeVsPinnacle:pnv!=null?wr-pnv:null,
      roi:bk.n>0?(bk.wins*(avg-1)-(bk.n-bk.wins))/bk.n:0,
    };
  });

  const edges = byBook.map(b=>b.edgeVsBook).sort((a,b)=>a-b);
  const medianEdge = edges.length ? edges[Math.floor(edges.length/2)] : 0;
  const bestBook = byBook.reduce((best,b)=>b.edgeVsBook>(best?.edgeVsBook??-99)?b:best, null);

  return { n, winRate, byBook, medianEdge, bestBook, roiAll:n>0?roiSum/n:0 };
}
