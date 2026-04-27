import { useState, useEffect, useCallback, useMemo } from 'react';
import Sidebar from './components/Sidebar';
import Calculator from './components/Calculator';
import Report from './components/Report';
import BruteforceAnalyser from './components/BruteforceAnalyser';
import BettingAnalyser from './components/BettingAnalyser';
import BettingSimulator from './components/BettingSimulator';
import EdgeAnalyser from './components/EdgeAnalyser';
import useFormula from './hooks/useFormula';

// ── Abbreviation normalization (mirrors merge_data.py) ───────────────────────
const ABBR_NORM = { NJN:'BKN', NOH:'NOP', NOK:'NOP', SEA:'OKC', CHH:'CHA' };
const norm = a => ABBR_NORM[a?.toUpperCase()] ?? a?.toUpperCase() ?? a;

// ── Stat keys in V3 order (matches nodes.h exactly) ──────────────────────────
const STAT_KEYS = [
  'A_rest',    'B_rest',
  'A_density', 'B_density',
  'A_streak',  'B_streak',
  'A_W_s',     'B_W_s',
  'A_ORTG_s',  'B_ORTG_s',
  'A_DRTG_s',  'B_DRTG_s',
  'A_MOV_s',   'B_MOV_s',
  'A_elo',     'B_elo',
  'A_ORTG_l3', 'B_ORTG_l3',
  'A_DRTG_l3', 'B_DRTG_l3',
  'A_MOV_l3',  'B_MOV_l3',
  'A_ORTG_l10','B_ORTG_l10',
  'A_DRTG_l10','B_DRTG_l10',
  'A_MOV_l10', 'B_MOV_l10',
];

// ── Build odds index from odds JSON ──────────────────────────────────────────
function buildOddsIndex(oddsData) {
  const matches = oddsData.matches ?? oddsData;
  const index = {};
  for (const m of matches) {
    const h = norm(m.home_abbr ?? m.home_team);
    const a = norm(m.away_abbr ?? m.away_team);
    const key = `${m.date}|${h}|${a}`;
    // Keep entry with most bookmakers if duplicate
    if (!index[key] || Object.keys(m.odds ?? {}).length > Object.keys(index[key].odds ?? {}).length)
      index[key] = m;
  }
  return index;
}

// ── Parse stats JSON into match objects ──────────────────────────────────────
function parseMatches(statsData, oddsIndex) {
  const raw = statsData.matches ?? statsData;
  return raw.map(m => {
    const stats = STAT_KEYS.map(k => m[k] ?? 0);
    const h = norm(m.home_team ?? m.home_abbr);
    const a = norm(m.away_team ?? m.away_abbr);

    // Try exact date, then +1 day (UTC/ET offset)
    let oddsMatch = oddsIndex?.[`${m.date}|${h}|${a}`] ?? null;
    if (!oddsMatch && oddsIndex) {
      try {
        const d = new Date(m.date + 'T12:00:00');
        d.setDate(d.getDate() + 1);
        const next = d.toISOString().slice(0, 10);
        oddsMatch = oddsIndex[`${next}|${h}|${a}`] ?? null;
      } catch {}
    }

    return {
      game_id:    m.game_id,
      date:       m.date,
      season:     m.season,
      home_abbr:  h,
      away_abbr:  a,
      stats,
      a_wins:     m.A_wins ?? m.home_wins ?? 0,
      month:      m.date.slice(0, 7),
      odds:       oddsMatch?.odds ?? null,
      no_vig_ref: oddsMatch?.no_vig_ref ?? null,
      has_odds:   !!oddsMatch,
    };
  });
}

// ── Read file as JSON ─────────────────────────────────────────────────────────
async function readJSON(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = e => {
      try { resolve(JSON.parse(e.target.result)); }
      catch(err) { reject(new Error(`JSON invalide : ${err.message}`)); }
    };
    reader.onerror = () => reject(new Error('Erreur de lecture du fichier'));
    reader.readAsText(file);
  });
}

// ── File Loader Screen ────────────────────────────────────────────────────────
function FileLoader({ savedOddsIndex, onLoaded }) {
  const [statsFile,  setStatsFile]  = useState(null);
  const [oddsFile,   setOddsFile]   = useState(null);
  const [loading,    setLoading]    = useState(false);
  const [error,      setError]      = useState(null);

  const handleLoad = async () => {
    if (!statsFile) return;
    setLoading(true); setError(null);
    try {
      const statsData = await readJSON(statsFile);
      let oddsIndex = savedOddsIndex;
      if (oddsFile) {
        const oddsData = await readJSON(oddsFile);
        oddsIndex = buildOddsIndex(oddsData);
      }
      const matches = parseMatches(statsData, oddsIndex ?? {});
      onLoaded({ matches, oddsIndex: oddsIndex ?? {}, statsFileName: statsFile.name, hasOdds: !!(oddsIndex && Object.keys(oddsIndex).length) });
    } catch(e) {
      setError(e.message);
    }
    setLoading(false);
  };

  const FileDrop = ({ label, accept, file, onFile, hint }) => {
    const [drag, setDrag] = useState(false);
    const onDrop = e => {
      e.preventDefault(); setDrag(false);
      const f = e.dataTransfer.files[0];
      if (f) onFile(f);
    };
    return (
      <div
        onDragOver={e => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={onDrop}
        style={{
          border: `2px dashed ${drag ? '#f59e0b' : file ? '#3fb950' : '#30363d'}`,
          borderRadius: 10, padding: '20px 24px', textAlign: 'center',
          background: drag ? '#1a1400' : file ? '#0f2d10' : '#0d1117',
          cursor: 'pointer', transition: 'all .15s',
        }}
        onClick={() => document.getElementById(`file-${label}`).click()}
      >
        <input id={`file-${label}`} type="file" accept={accept}
          style={{ display:'none' }} onChange={e => e.target.files[0] && onFile(e.target.files[0])} />
        <div style={{ fontSize: 28, marginBottom: 8 }}>
          {file ? '✓' : drag ? '📂' : '📄'}
        </div>
        <div style={{ fontSize: 13, fontWeight: 600, color: file ? '#3fb950' : '#e6edf3', marginBottom: 4 }}>
          {file ? file.name : label}
        </div>
        <div style={{ fontSize: 11, color: '#484f58' }}>{hint}</div>
      </div>
    );
  };

  return (
    <div style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', padding: 40, gap: 24 }}>
      <div style={{ textAlign: 'center', marginBottom: 8 }}>
        <div style={{ fontFamily:"'JetBrains Mono', monospace", fontSize: 11, color: '#f59e0b', letterSpacing: 3, textTransform: 'uppercase', marginBottom: 8 }}>
          Formula Playground V2
        </div>
        <div style={{ fontSize: 20, fontWeight: 700, color: '#e6edf3', marginBottom: 4 }}>Charger les données</div>
        <div style={{ fontSize: 12, color: '#484f58' }}>Stats NBA V3 requis · Odds optionnel (peut être chargé séparément)</div>
      </div>

      <div style={{ width: '100%', maxWidth: 520, display: 'flex', flexDirection: 'column', gap: 14 }}>
        <FileDrop
          label="Stats NBA (nba_full.json / nba_2nd.json…)"
          accept=".json"
          file={statsFile}
          onFile={setStatsFile}
          hint="Fichier JSON V3 — format nba_data.json avec A_elo, A_rest, etc."
        />

        {!savedOddsIndex || !Object.keys(savedOddsIndex).length ? (
          <FileDrop
            label="Odds (nba_odds.json) — optionnel"
            accept=".json"
            file={oddsFile}
            onFile={setOddsFile}
            hint="Chargé une seule fois · Persiste entre les changements de stats"
          />
        ) : (
          <div style={{ display:'flex', alignItems:'center', gap:10, padding:'12px 16px', background:'#0d1117', border:'1px solid #21262d', borderRadius:8 }}>
            <span style={{ fontSize:18 }}>✓</span>
            <div>
              <div style={{ fontSize:12, color:'#3fb950', fontWeight:600 }}>Odds déjà chargés</div>
              <div style={{ fontSize:11, color:'#484f58' }}>Persiste entre les datasets stats</div>
            </div>
            <div style={{ marginLeft:'auto' }}>
              <FileDrop
                label="Changer odds"
                accept=".json"
                file={oddsFile}
                onFile={setOddsFile}
                hint=""
              />
            </div>
          </div>
        )}

        {error && (
          <div style={{ background:'#1a0000', border:'1px solid #f85149', borderRadius:8, padding:'10px 14px', fontSize:12, color:'#f85149' }}>
            ⚠️ {error}
          </div>
        )}

        <button
          onClick={handleLoad}
          disabled={!statsFile || loading}
          style={{
            padding: '14px', borderRadius: 10, fontSize: 14, fontWeight: 700,
            background: statsFile && !loading ? '#0f2d10' : '#0d1117',
            border: `1px solid ${statsFile && !loading ? '#3fb950' : '#21262d'}`,
            color: statsFile && !loading ? '#3fb950' : '#484f58',
            cursor: statsFile && !loading ? 'pointer' : 'default',
          }}
        >
          {loading ? '⏳ Chargement…' : '▶ Charger et lancer le Playground'}
        </button>
      </div>
    </div>
  );
}

// ── Playground Page ───────────────────────────────────────────────────────────
function PlaygroundPage({ matches, externalOpcodes, onExternalConsumed, onFormulaChange, threshModStat, quantileMode }) {
  const { opcodes, stackHeight, isComplete, partialStack, nPh, results, push, undo, clear, loadOpcodes } =
    useFormula(matches, threshModStat, quantileMode);

  useEffect(() => { onFormulaChange(opcodes); }, [opcodes]);

  useEffect(() => {
    if (!externalOpcodes) return;
    loadOpcodes(externalOpcodes);
    onExternalConsumed();
  }, [externalOpcodes]);

  return (
    <div style={{ display:'flex', height:'100%' }}>
      <div style={{ width:440, minWidth:440, borderRight:'1px solid #21262d', overflowY:'auto', padding:'20px 18px' }}>
        <div style={{ marginBottom:16 }}>
          <div style={{ fontSize:18, fontWeight:700, color:'#e6edf3', marginBottom:2 }}>Playground Analyser</div>
          <div style={{ fontSize:12, color:'#484f58' }}>
            {matches.length} matchs · {[...new Set(matches.map(m=>m.season))].length} saisons
            {' '}· {matches.filter(m=>m.has_odds).length} avec cotes
          </div>
        </div>
        <Calculator
          opcodes={opcodes} stackHeight={stackHeight} isComplete={isComplete}
          partialStack={partialStack} results={results} nPh={nPh}
          onPush={push} onUndo={undo} onClear={clear} onLoad={loadOpcodes}
          threshModStat={threshModStat} quantileMode={quantileMode}
        />
      </div>
      <div style={{ flex:1, overflowY:'auto', padding:'20px 24px' }}>
        <Report results={results} matches={matches} />
      </div>
    </div>
  );
}

// ── Root App ──────────────────────────────────────────────────────────────────
export default function App() {
  const [page,           setPage]           = useState('playground');
  const [matches,        setMatches]        = useState(null);
  const [oddsIndex,      setOddsIndex]      = useState({});
  const [statsFileName,  setStatsFileName]  = useState(null);
  const [hasOdds,        setHasOdds]        = useState(false);
  const [showLoader,     setShowLoader]     = useState(false);
  // Shared formula state
  const [sharedOpcodes,  setSharedOpcodes]  = useState([]);
  const [pendingOpcodes, setPendingOpcodes] = useState(null);
  // Threshold modifier state (global, shared across pages)
  const [threshModStat,  setThreshModStat]  = useState(-1);
  const [quantileMode,   setQuantileMode]   = useState(false);

  const handleLoaded = useCallback(({ matches: m, oddsIndex: oi, statsFileName: fn, hasOdds: ho }) => {
    setMatches(m);
    setOddsIndex(oi);
    setStatsFileName(fn);
    setHasOdds(ho);
    setShowLoader(false);
  }, []);

  const needsLoad = !matches || showLoader;

  const show = p => !needsLoad && page === p;

  const handleChangeStats = () => setShowLoader(true);

  return (
    <div style={{ display:'flex', height:'100vh', overflow:'hidden' }}>
      {!needsLoad && (
        <Sidebar
          current={page} onSelect={setPage}
          statsFileName={statsFileName}
          hasOdds={hasOdds}
          nMatches={matches?.length ?? 0}
          onChangeStats={handleChangeStats}
          threshModStat={threshModStat}
          quantileMode={quantileMode}
          onThreshModChange={setThreshModStat}
          onQuantileModeChange={setQuantileMode}
        />
      )}
      <div style={{ flex:1, display:'flex', overflow:'hidden' }}>
        {needsLoad && (
          <FileLoader
            savedOddsIndex={oddsIndex}
            onLoaded={handleLoaded}
          />
        )}
        {show('playground') && (
          <PlaygroundPage
            matches={matches}
            externalOpcodes={pendingOpcodes}
            onExternalConsumed={() => setPendingOpcodes(null)}
            onFormulaChange={setSharedOpcodes}
            threshModStat={threshModStat}
            quantileMode={quantileMode}
          />
        )}
        {show('bruteforce') && (
          <BruteforceAnalyser
            matches={matches}
            onLoadFormula={ops => { setPendingOpcodes(ops); setPage('playground'); }}
          />
        )}
        {show('betting-analyser') && (
          <BettingAnalyser
            matches={matches}
            sharedOpcodes={sharedOpcodes}
            threshModStat={threshModStat}
            quantileMode={quantileMode}
          />
        )}
        {show('betting-simulator') && (
          <BettingSimulator
            matches={matches}
            sharedOpcodes={sharedOpcodes}
            threshModStat={threshModStat}
            quantileMode={quantileMode}
          />
        )}
        {show('edge-analyser') && (
          <EdgeAnalyser
            matches={matches}
            sharedOpcodes={sharedOpcodes}
            threshModStat={threshModStat}
            quantileMode={quantileMode}
          />
        )}
      </div>
    </div>
  );
}
