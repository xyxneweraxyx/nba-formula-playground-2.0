// matchTypes.js — V3 match type segments for Edge Analyser
// V3 stat indices:
//   0/1=rest, 2/3=density, 4/5=streak, 6/7=W_s
//   8/9=ORTG_s, 10/11=DRTG_s, 12/13=MOV_s, 14/15=elo
//   16/17=ORTG_l3, 18/19=DRTG_l3, 20/21=MOV_l3
//   22/23=ORTG_l10, 24/25=DRTG_l10, 26/27=MOV_l10

const dow  = m => new Date(m.date + 'T12:00:00').getDay();
const mon  = m => parseInt(m.date.slice(5, 7));
const s    = m => m.stats;

// V3 stat accessors
const A_rest      = m => s(m)[0];  const B_rest    = m => s(m)[1];
const A_streak    = m => s(m)[4];  const B_streak  = m => s(m)[5];
const A_W_s       = m => s(m)[6];  const B_W_s     = m => s(m)[7];
const A_ORTG_s    = m => s(m)[8];  const B_ORTG_s  = m => s(m)[9];
const A_DRTG_s    = m => s(m)[10]; const B_DRTG_s  = m => s(m)[11];
const A_MOV_s     = m => s(m)[12]; const B_MOV_s   = m => s(m)[13];
const A_elo       = m => s(m)[14]; const B_elo     = m => s(m)[15];
const A_ORTG_l3   = m => s(m)[16]; const B_ORTG_l3 = m => s(m)[17];
const A_DRTG_l3   = m => s(m)[18]; const B_DRTG_l3 = m => s(m)[19];
const A_MOV_l3    = m => s(m)[20]; const B_MOV_l3  = m => s(m)[21];
const A_ORTG_l10  = m => s(m)[22]; const B_ORTG_l10= m => s(m)[23];
const A_DRTG_l10  = m => s(m)[24]; const B_DRTG_l10= m => s(m)[25];
const A_MOV_l10   = m => s(m)[26]; const B_MOV_l10 = m => s(m)[27];

const eloGap = m => Math.abs(A_elo(m) - B_elo(m));
const movGap = m => Math.abs(A_MOV_s(m) - B_MOV_s(m));
const pH     = m => m.no_vig_ref ? m.no_vig_ref.home : null;

const t = (id, label, category, condition, filter) => ({ id, label, category, condition, filter });

export const MATCH_TYPES = [
  // ── Référence ──────────────────────────────────────────────────────────────
  t('all','Tous les matchs','Référence','Aucun filtre — dataset complet avec cotes', () => true),

  // ── Par Saison ─────────────────────────────────────────────────────────────
  t('s2122','Saison 2021-22','Par Saison','season == "2021-22"', m => m.season==='2021-22'),
  t('s2223','Saison 2022-23','Par Saison','season == "2022-23"', m => m.season==='2022-23'),
  t('s2324','Saison 2023-24','Par Saison','season == "2023-24"', m => m.season==='2023-24'),
  t('s2425','Saison 2024-25','Par Saison','season == "2024-25"', m => m.season==='2024-25'),
  t('s2526','Saison 2025-26','Par Saison','season == "2025-26"', m => m.season==='2025-26'),

  // ── Jour de la semaine ─────────────────────────────────────────────────────
  t('dow_mon','Lundi','Jour','Lundi', m => dow(m)===1),
  t('dow_tue','Mardi','Jour','Mardi', m => dow(m)===2),
  t('dow_wed','Mercredi','Jour','Mercredi', m => dow(m)===3),
  t('dow_thu','Jeudi','Jour','Jeudi', m => dow(m)===4),
  t('dow_fri','Vendredi','Jour','Vendredi', m => dow(m)===5),
  t('dow_sat','Samedi','Jour','Samedi', m => dow(m)===6),
  t('dow_sun','Dimanche','Jour','Dimanche', m => dow(m)===0),
  t('dow_wknd','Week-end','Jour','Samedi ou Dimanche', m => dow(m)===0||dow(m)===6),
  t('dow_wkday','Semaine','Jour','Lundi à Vendredi', m => dow(m)>=1&&dow(m)<=5),

  // ── Mois ───────────────────────────────────────────────────────────────────
  t('m_oct','Octobre','Mois','Octobre (début de saison)', m => mon(m)===10),
  t('m_nov','Novembre','Mois','Novembre', m => mon(m)===11),
  t('m_dec','Décembre','Mois','Décembre', m => mon(m)===12),
  t('m_jan','Janvier','Mois','Janvier', m => mon(m)===1),
  t('m_feb','Février','Mois','Février', m => mon(m)===2),
  t('m_mar','Mars','Mois','Mars', m => mon(m)===3),
  t('m_apr','Avril','Mois','Avril (fin de saison)', m => mon(m)===4),

  // ── Écart Elo ───────────────────────────────────────────────────────────────
  t('elo_lt25','Elo gap < 25','Elo Gap','|A_elo − B_elo| < 25 pts — quasi identiques', m => eloGap(m)<25),
  t('elo_25_50','Elo gap 25-50','Elo Gap','|A_elo − B_elo| entre 25 et 50 pts', m => eloGap(m)>=25&&eloGap(m)<50),
  t('elo_50_100','Elo gap 50-100','Elo Gap','|A_elo − B_elo| entre 50 et 100 pts', m => eloGap(m)>=50&&eloGap(m)<100),
  t('elo_100_200','Elo gap 100-200','Elo Gap','|A_elo − B_elo| entre 100 et 200 pts', m => eloGap(m)>=100&&eloGap(m)<200),
  t('elo_gt200','Elo gap > 200','Elo Gap','|A_elo − B_elo| > 200 pts — gros mismatch', m => eloGap(m)>=200),

  // ── Elo absolu A ────────────────────────────────────────────────────────────
  t('h_elo_gt1600','Home élite Elo (>1600)','Force Elo','A_elo > 1600', m => A_elo(m)>1600),
  t('h_elo_gt1550','Home fort Elo (>1550)','Force Elo','A_elo > 1550', m => A_elo(m)>1550),
  t('h_elo_lt1450','Home faible Elo (<1450)','Force Elo','A_elo < 1450', m => A_elo(m)<1450),
  t('a_elo_gt1600','Away élite Elo (>1600)','Force Elo','B_elo > 1600', m => B_elo(m)>1600),
  t('a_elo_gt1550','Away fort Elo (>1550)','Force Elo','B_elo > 1550', m => B_elo(m)>1550),
  t('a_elo_lt1450','Away faible Elo (<1450)','Force Elo','B_elo < 1450', m => B_elo(m)<1450),

  // ── Repos (rest) ────────────────────────────────────────────────────────────
  t('h_b2b','Home back-to-back (rest=1)','Repos','A_rest == 1 — joue le lendemain', m => A_rest(m)===1),
  t('h_rest2','Home bien reposé (rest>=2)','Repos','A_rest >= 2', m => A_rest(m)>=2),
  t('h_rest3','Home très reposé (rest>=3)','Repos','A_rest >= 3', m => A_rest(m)>=3),
  t('a_b2b','Away back-to-back (rest=1)','Repos','B_rest == 1', m => B_rest(m)===1),
  t('a_rest2','Away bien reposé (rest>=2)','Repos','B_rest >= 2', m => B_rest(m)>=2),
  t('h_b2b_a_rest','Home B2B + Away reposé','Repos','A_rest=1 ET B_rest>=2 — désavantage home', m => A_rest(m)===1&&B_rest(m)>=2),
  t('a_b2b_h_rest','Away B2B + Home reposé','Repos','B_rest=1 ET A_rest>=2 — désavantage away', m => B_rest(m)===1&&A_rest(m)>=2),
  t('both_b2b','Les deux B2B','Repos','A_rest=1 ET B_rest=1', m => A_rest(m)===1&&B_rest(m)===1),

  // ── Streak ────────────────────────────────────────────────────────────────
  t('h_streak3','Home série victoires (≥3)','Streak','A_streak >= 3 — en feu', m => A_streak(m)>=3),
  t('h_streak_lose3','Home série défaites (≤-3)','Streak','A_streak <= -3', m => A_streak(m)<=-3),
  t('a_streak3','Away série victoires (≥3)','Streak','B_streak >= 3', m => B_streak(m)>=3),
  t('a_streak_lose3','Away série défaites (≤-3)','Streak','B_streak <= -3', m => B_streak(m)<=-3),
  t('h_hot_a_cold','Home chaud + Away froid','Streak','A_streak>=3 ET B_streak<=-2', m => A_streak(m)>=3&&B_streak(m)<=-2),
  t('a_hot_h_cold','Away chaud + Home froid','Streak','B_streak>=3 ET A_streak<=-2', m => B_streak(m)>=3&&A_streak(m)<=-2),

  // ── Écart MOV saison ─────────────────────────────────────────────────────
  t('mov_lt2','MOV gap < 2','Niveau MOV','|A_MOV_s − B_MOV_s| < 2 pts/match', m => movGap(m)<2),
  t('mov_2_5','MOV gap 2-5','Niveau MOV','|A_MOV_s − B_MOV_s| entre 2 et 5', m => movGap(m)>=2&&movGap(m)<5),
  t('mov_5_10','MOV gap 5-10','Niveau MOV','|A_MOV_s − B_MOV_s| entre 5 et 10', m => movGap(m)>=5&&movGap(m)<10),
  t('mov_gt10','MOV gap > 10','Niveau MOV','|A_MOV_s − B_MOV_s| > 10 pts/match — gros écart', m => movGap(m)>=10),

  // ── Performance saison Home ──────────────────────────────────────────────
  t('h_ortg_high','Home haute attaque (ORTG_s>115)','Perf Home','A_ORTG_s > 115', m => A_ORTG_s(m)>115),
  t('h_ortg_low','Home faible attaque (ORTG_s<108)','Perf Home','A_ORTG_s < 108', m => A_ORTG_s(m)<108),
  t('h_drtg_low','Home bonne défense (DRTG_s<108)','Perf Home','A_DRTG_s < 108', m => A_DRTG_s(m)<108),
  t('h_drtg_high','Home mauvaise défense (DRTG_s>113)','Perf Home','A_DRTG_s > 113', m => A_DRTG_s(m)>113),
  t('h_mov_pos','Home bilan positif (MOV_s>3)','Perf Home','A_MOV_s > 3', m => A_MOV_s(m)>3),
  t('h_mov_neg','Home bilan négatif (MOV_s<0)','Perf Home','A_MOV_s < 0', m => A_MOV_s(m)<0),

  // ── Performance saison Away ──────────────────────────────────────────────
  t('a_ortg_high','Away haute attaque (ORTG_s>115)','Perf Away','B_ORTG_s > 115', m => B_ORTG_s(m)>115),
  t('a_ortg_low','Away faible attaque (ORTG_s<108)','Perf Away','B_ORTG_s < 108', m => B_ORTG_s(m)<108),
  t('a_drtg_low','Away bonne défense (DRTG_s<108)','Perf Away','B_DRTG_s < 108', m => B_DRTG_s(m)<108),
  t('a_drtg_high','Away mauvaise défense (DRTG_s>113)','Perf Away','B_DRTG_s > 113', m => B_DRTG_s(m)>113),
  t('a_mov_pos','Away bilan positif (MOV_s>3)','Perf Away','B_MOV_s > 3', m => B_MOV_s(m)>3),
  t('a_mov_neg','Away bilan négatif (MOV_s<0)','Perf Away','B_MOV_s < 0', m => B_MOV_s(m)<0),

  // ── Divergence forme vs saison (l10 vs s) ────────────────────────────────
  t('h_form_up5','Home en progression (l10>s+5)','Divergence','A_MOV_l10 > A_MOV_s + 5', m => A_MOV_l10(m)>A_MOV_s(m)+5),
  t('h_form_up3','Home en hausse (l10>s+3)','Divergence','A_MOV_l10 > A_MOV_s + 3', m => A_MOV_l10(m)>A_MOV_s(m)+3),
  t('h_form_down5','Home en déclin (l10<s-5)','Divergence','A_MOV_l10 < A_MOV_s - 5', m => A_MOV_l10(m)<A_MOV_s(m)-5),
  t('h_form_down3','Home en baisse (l10<s-3)','Divergence','A_MOV_l10 < A_MOV_s - 3', m => A_MOV_l10(m)<A_MOV_s(m)-3),
  t('a_form_up5','Away en progression (l10>s+5)','Divergence','B_MOV_l10 > B_MOV_s + 5', m => B_MOV_l10(m)>B_MOV_s(m)+5),
  t('a_form_up3','Away en hausse (l10>s+3)','Divergence','B_MOV_l10 > B_MOV_s + 3', m => B_MOV_l10(m)>B_MOV_s(m)+3),
  t('a_form_down5','Away en déclin (l10<s-5)','Divergence','B_MOV_l10 < B_MOV_s - 5', m => B_MOV_l10(m)<B_MOV_s(m)-5),
  t('a_form_down3','Away en baisse (l10<s-3)','Divergence','B_MOV_l10 < B_MOV_s - 3', m => B_MOV_l10(m)<B_MOV_s(m)-3),

  // ── Momentum l3 ──────────────────────────────────────────────────────────
  t('h_l3_great','Home excellent l3 (MOV_l3>8)','Momentum l3','A_MOV_l3 > 8 pts/match sur 3 derniers', m => A_MOV_l3(m)>8),
  t('h_l3_bad','Home mauvais l3 (MOV_l3<-8)','Momentum l3','A_MOV_l3 < -8 pts/match', m => A_MOV_l3(m)<-8),
  t('a_l3_great','Away excellent l3 (MOV_l3>8)','Momentum l3','B_MOV_l3 > 8 pts/match', m => B_MOV_l3(m)>8),
  t('a_l3_bad','Away mauvais l3 (MOV_l3<-8)','Momentum l3','B_MOV_l3 < -8 pts/match', m => B_MOV_l3(m)<-8),
  t('l3_contrast','Grande divergence l3 (>10)','Momentum l3','|A_MOV_l3 − B_MOV_l3| > 10', m => Math.abs(A_MOV_l3(m)-B_MOV_l3(m))>10),

  // ── Momentum l10 ─────────────────────────────────────────────────────────
  t('h_l10_great','Home excellent l10 (MOV_l10>5)','Momentum l10','A_MOV_l10 > 5 pts/match', m => A_MOV_l10(m)>5),
  t('h_l10_bad','Home mauvais l10 (MOV_l10<-5)','Momentum l10','A_MOV_l10 < -5 pts/match', m => A_MOV_l10(m)<-5),
  t('a_l10_great','Away excellent l10 (MOV_l10>5)','Momentum l10','B_MOV_l10 > 5 pts/match', m => B_MOV_l10(m)>5),
  t('a_l10_bad','Away mauvais l10 (MOV_l10<-5)','Momentum l10','B_MOV_l10 < -5 pts/match', m => B_MOV_l10(m)<-5),

  // ── Cotes marché Pinnacle ────────────────────────────────────────────────
  t('p_heavy_h','Favori home >70%','Marché','Pinnacle no-vig home > 70%', m => pH(m)!=null&&pH(m)>0.70),
  t('p_h_fav','Home favori 60-70%','Marché','Pinnacle no-vig home 60-70%', m => pH(m)!=null&&pH(m)>=0.60&&pH(m)<=0.70),
  t('p_coin','Coin flip 45-55%','Marché','Pinnacle no-vig home 45-55%', m => pH(m)!=null&&pH(m)>=0.45&&pH(m)<=0.55),
  t('p_a_fav','Away favori (home 30-45%)','Marché','Pinnacle no-vig home 30-45%', m => pH(m)!=null&&pH(m)>=0.30&&pH(m)<0.45),
  t('p_heavy_a','Favori away >70%','Marché','Pinnacle no-vig home < 30%', m => pH(m)!=null&&pH(m)<0.30),

  // ── Victoires saison ─────────────────────────────────────────────────────
  t('h_w_gt30','Home > 30 victoires','Victoires','A_W_s > 30', m => A_W_s(m)>30),
  t('h_w_lt20','Home < 20 victoires','Victoires','A_W_s < 20', m => A_W_s(m)<20),
  t('a_w_gt30','Away > 30 victoires','Victoires','B_W_s > 30', m => B_W_s(m)>30),
  t('a_w_lt20','Away < 20 victoires','Victoires','B_W_s < 20', m => B_W_s(m)<20),

  // ── Combiné ───────────────────────────────────────────────────────────────
  t('cb_elo_up_mov','Elo favor + MOV favor home','Combiné','A_elo>B_elo ET A_MOV_s>B_MOV_s', m => A_elo(m)>B_elo(m)&&A_MOV_s(m)>B_MOV_s(m)),
  t('cb_elo_down','Elo défavorable home','Combiné','B_elo>A_elo+100 (away favoris Elo)', m => B_elo(m)>A_elo(m)+100),
  t('cb_h_b2b_elofav','Home B2B mais Elo supérieur','Combiné','A_rest=1 ET A_elo>B_elo+50', m => A_rest(m)===1&&A_elo(m)>B_elo(m)+50),
  t('cb_upset_elo','Upset potentiel (Away Elo fort, Home favori cotes)','Combiné','B_elo>A_elo+80 mais marché penche home', m => B_elo(m)>A_elo(m)+80&&pH(m)!=null&&pH(m)>0.50),
  t('cb_both_streak','Les deux en série positive','Combiné','A_streak>=2 ET B_streak>=2', m => A_streak(m)>=2&&B_streak(m)>=2),
  t('cb_l10_contrast','Formes l10 contrastées (>10 pts)','Combiné','|A_MOV_l10 − B_MOV_l10| > 10', m => Math.abs(A_MOV_l10(m)-B_MOV_l10(m))>10),
  t('cb_drtg_both_good','Les deux bonne défense l10','Combiné','A_DRTG_l10<108 ET B_DRTG_l10<108', m => A_DRTG_l10(m)<108&&B_DRTG_l10(m)<108),
];

export const CATEGORIES = [...new Set(MATCH_TYPES.map(t => t.category))];

export const CAT_COLORS = {
  'Référence':     '#60a5fa',
  'Par Saison':    '#818cf8',
  'Jour':          '#a78bfa',
  'Mois':          '#c084fc',
  'Elo Gap':       '#e879f9',
  'Force Elo':     '#f472b6',
  'Repos':         '#fb923c',
  'Streak':        '#f59e0b',
  'Niveau MOV':    '#84cc16',
  'Perf Home':     '#10b981',
  'Perf Away':     '#2dd4bf',
  'Divergence':    '#06b6d4',
  'Momentum l3':   '#3b82f6',
  'Momentum l10':  '#6366f1',
  'Marché':        '#ec4899',
  'Victoires':     '#eab308',
  'Combiné':       '#f43f5e',
};
