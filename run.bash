#!/bin/bash
set -e
cd "$(dirname "$0")"

echo ""
echo "╔══════════════════════════════════╗"
echo "║    FORMULA PLAYGROUND V2         ║"
echo "╚══════════════════════════════════╝"
echo ""

if ! command -v node &> /dev/null; then
    echo "❌  Node.js n'est pas installé."
    echo "    Télécharge-le sur https://nodejs.org/"
    exit 1
fi

echo "📦  Installation des dépendances npm..."
npm install --silent

echo ""
echo "🚀  Démarrage du serveur..."
echo "    → http://localhost:5173"
echo ""
npm run dev
