#!/usr/bin/env bash
cd "$(dirname "$0")"
if [ ! -d client/node_modules ]; then echo "Installing dependencies for first run..."; npm run setup; fi
echo "Starting Tradezilla journal (dev server)..."
npm run dev
