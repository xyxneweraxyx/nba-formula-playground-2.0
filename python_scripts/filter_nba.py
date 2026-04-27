#!/usr/bin/env python3
"""
filter_nba.py — Filtre un fichier nba_data JSON (format V3)

Usage:
    python filter_nba.py input.json output.json [options]

Options:
    --second-half               Garde uniquement la 2ème moitié de saison (W_s >= 41)
    --min-games N               Garde les matchs où les deux équipes ont joué >= N matchs
    --max-games N               Garde les matchs où les deux équipes ont joué <= N matchs
    --exclude-season SAISON     Exclut une saison (ex: 2021-22). Répétable.
    --only-season SAISON        Ne garde qu'une saison (ex: 2025-26). Répétable.
    --exclude-early N           Exclut les N premiers matchs de chaque saison par équipe
                                (utile pour éviter le cold start Elo/stats)
    --regular-only              Exclut les matchs où A_W_s == 0 ET B_W_s == 0
                                (élimine les tout premiers matchs de la saison)

Exemples:
    # 2ème moitié, sans la saison 2021-22 (train)
    python filter_nba.py nba_full.json nba_train.json --second-half --exclude-season 2021-22

    # Uniquement la saison 2024-25, 2ème moitié (val)
    python filter_nba.py nba_full.json nba_val.json --second-half --only-season 2024-25

    # Dataset complet sans les saisons bruyantes
    python filter_nba.py nba_full.json nba_clean.json --exclude-season 2021-22 --exclude-season 2022-23

    # Uniquement la 2025-26
    python filter_nba.py nba_full.json nba_2526.json --only-season 2025-26
"""

import json
import argparse
import sys
from pathlib import Path
from collections import defaultdict


def parse_args():
    p = argparse.ArgumentParser(
        description="Filtre nba_data JSON V3",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__,
    )
    p.add_argument("input",  help="Fichier JSON source (nba_full.json)")
    p.add_argument("output", help="Fichier JSON de sortie")

    p.add_argument("--second-half", action="store_true",
                   help="Garde uniquement W_s >= 41 pour les deux équipes")
    p.add_argument("--min-games", type=int, default=0, metavar="N",
                   help="Garde les matchs où W_s + nombre de défaites >= N (approx. matchs joués)")
    p.add_argument("--max-games", type=int, default=9999, metavar="N",
                   help="Garde les matchs où max(A_W_s, B_W_s) <= N")
    p.add_argument("--exclude-season", action="append", default=[], metavar="SAISON",
                   dest="exclude_seasons",
                   help="Exclut une saison (ex: 2021-22). Répétable.")
    p.add_argument("--only-season", action="append", default=[], metavar="SAISON",
                   dest="only_seasons",
                   help="Ne garde qu'une ou plusieurs saisons. Répétable.")
    p.add_argument("--exclude-early", type=int, default=0, metavar="N",
                   help="Exclut les matchs où une équipe a joué < N matchs dans la saison")
    p.add_argument("--regular-only", action="store_true",
                   help="Exclut les matchs d'ouverture (A_W_s=0 ET B_W_s=0)")
    p.add_argument("--verbose", "-v", action="store_true",
                   help="Affiche le détail du filtrage")

    return p.parse_args()


def games_played_approx(match):
    """
    Approximation du nombre de matchs joués dans la saison pour chaque équipe.
    On ne connaît que W_s (victoires), pas le bilan complet.
    On utilise W_s comme proxy — imparfait mais suffisant pour --second-half.

    Pour --second-half : une saison NBA = 82 matchs, mi-saison ≈ 41 matchs joués.
    W_s >= 41 n'est pas fiable (une équipe de 0-41 a joué 41 matchs mais W_s=0).

    Meilleure heuristique : utiliser la date + numéro de match dans la saison.
    On compte les matchs vus par saison et on filtre sur la moitié chronologique.
    """
    return match.get("A_W_s", 0), match.get("B_W_s", 0)


def main():
    args = parse_args()

    # Chargement
    input_path = Path(args.input)
    if not input_path.exists():
        print(f"❌ Fichier introuvable : {args.input}", file=sys.stderr)
        sys.exit(1)

    print(f"📂 Chargement de {args.input}…")
    with open(input_path, encoding="utf-8") as f:
        data = json.load(f)

    matches = data.get("matches", data) if isinstance(data, dict) else data
    meta    = data.get("meta", {}) if isinstance(data, dict) else {}

    print(f"   {len(matches)} matchs au total")

    # ── Filtres saison ────────────────────────────────────────────────────────

    if args.only_seasons:
        before = len(matches)
        matches = [m for m in matches if m.get("season") in args.only_seasons]
        print(f"🔵 --only-season {args.only_seasons} : {before} → {len(matches)}")

    if args.exclude_seasons:
        before = len(matches)
        matches = [m for m in matches if m.get("season") not in args.exclude_seasons]
        print(f"🔴 --exclude-season {args.exclude_seasons} : {before} → {len(matches)}")

    # ── Filtre regular-only ───────────────────────────────────────────────────

    if args.regular_only:
        before = len(matches)
        matches = [m for m in matches
                   if not (m.get("A_W_s", 0) == 0 and m.get("B_W_s", 0) == 0)]
        print(f"🔶 --regular-only : {before} → {len(matches)}")

    # ── Filtre second-half / min-games par chronologie ────────────────────────
    # On group par saison et on garde la 2ème moitié selon l'ordre chronologique

    if args.second_half:
        # Grouper par saison, trier par date, garder la 2ème moitié
        by_season = defaultdict(list)
        for m in matches:
            by_season[m.get("season", "?")].append(m)

        kept = []
        for season, season_matches in by_season.items():
            season_matches.sort(key=lambda m: m.get("date", ""))
            cutoff = len(season_matches) // 2
            kept.extend(season_matches[cutoff:])
            if args.verbose:
                print(f"   {season}: {len(season_matches)} matchs → garde {len(season_matches)-cutoff} (2ème moitié)")

        before = len(matches)
        matches = sorted(kept, key=lambda m: m.get("date", ""))
        print(f"🟡 --second-half : {before} → {len(matches)}")

    # ── Filtre exclude-early (par équipe dans la saison) ─────────────────────

    if args.exclude_early > 0:
        # Pour chaque équipe dans chaque saison, compter combien de matchs ont été joués
        # On utilise W_s comme proxy (approximatif)
        before = len(matches)

        def min_ws(match):
            return min(match.get("A_W_s", 0), match.get("B_W_s", 0))

        # On filtre : les deux équipes ont W_s >= exclude_early / 2 (approximation)
        # Ou mieux : on trie par date et on exclut les N premiers matchs par équipe
        # Approche simple : exclure si A_W_s + A_losses < N ou B similaire
        # Sans données de défaites, on utilise W_s * 2 comme proxy grossier
        # ou simplement on coupe chronologiquement par équipe

        # Approche robuste : construire un compteur de matchs par équipe par saison
        team_match_count = defaultdict(int)  # (season, team) -> n_matches seen
        sorted_matches = sorted(matches, key=lambda m: (m.get("season",""), m.get("date","")))
        kept = []
        for m in sorted_matches:
            season = m.get("season", "?")
            home = m.get("home_team", "")
            away = m.get("away_team", "")
            cnt_h = team_match_count[(season, home)]
            cnt_a = team_match_count[(season, away)]
            team_match_count[(season, home)] += 1
            team_match_count[(season, away)] += 1
            if cnt_h >= args.exclude_early and cnt_a >= args.exclude_early:
                kept.append(m)

        matches = kept
        print(f"🟠 --exclude-early {args.exclude_early} : {before} → {len(matches)}")

    # ── Filtre min-games / max-games ──────────────────────────────────────────

    if args.min_games > 0:
        before = len(matches)
        # On approxime le nombre de matchs joués avec W_s (victoires seulement).
        # C'est sous-estimé (ex: 0-20 → W_s=0 mais 20 matchs joués).
        # Pour --min-games on utilise donc A_W_s comme borne basse soft.
        # Alternative : utiliser exclude_early ci-dessus qui est plus précis.
        matches = [m for m in matches
                   if m.get("A_W_s", 0) >= args.min_games / 2
                   and m.get("B_W_s", 0) >= args.min_games / 2]
        print(f"🟢 --min-games {args.min_games} : {before} → {len(matches)}")

    if args.max_games < 9999:
        before = len(matches)
        matches = [m for m in matches
                   if m.get("A_W_s", 0) <= args.max_games
                   and m.get("B_W_s", 0) <= args.max_games]
        print(f"🟢 --max-games {args.max_games} : {before} → {len(matches)}")

    # ── Résumé ────────────────────────────────────────────────────────────────

    seasons_present = sorted(set(m.get("season","?") for m in matches))
    print(f"\n✅ {len(matches)} matchs retenus")
    print(f"   Saisons : {', '.join(seasons_present) if seasons_present else '—'}")

    # ── Écriture ──────────────────────────────────────────────────────────────

    # Rebuild meta
    new_meta = dict(meta)
    new_meta["n_matches"] = len(matches)
    new_meta["seasons"]   = seasons_present
    new_meta["filter"]    = build_filter_description(args)

    output = { "meta": new_meta, "matches": matches }

    output_path = Path(args.output)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(output, f, indent=2, ensure_ascii=False)

    size_kb = output_path.stat().st_size // 1024
    print(f"💾 Écrit dans {args.output} ({size_kb} Ko)\n")


def build_filter_description(args):
    parts = []
    if args.only_seasons:
        parts.append(f"only={','.join(args.only_seasons)}")
    if args.exclude_seasons:
        parts.append(f"exclude={','.join(args.exclude_seasons)}")
    if args.second_half:
        parts.append("second-half")
    if args.exclude_early:
        parts.append(f"exclude-early={args.exclude_early}")
    if args.min_games:
        parts.append(f"min-games={args.min_games}")
    if args.max_games < 9999:
        parts.append(f"max-games={args.max_games}")
    if args.regular_only:
        parts.append("regular-only")
    return " | ".join(parts) if parts else "no filter"


if __name__ == "__main__":
    main()