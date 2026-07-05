@echo off
cd /d "%~dp0"
if not exist client\node_modules ( echo Installing dependencies for first run... && call npm run setup )
echo Starting Tradezilla journal (dev server)...
call npm run dev
