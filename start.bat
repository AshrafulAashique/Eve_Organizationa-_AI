@echo off
title Org AI Platform – Start

echo =================================================
echo Starting Infrastructure (PostgreSQL & ChromaDB)...
echo =================================================
docker-compose up -d

echo =================================================
echo Starting Voice Microservice...
echo =================================================
start "Voice Service" cmd /c "cd /d d:\waste\org-ai-platform\voice_service && uvicorn main:app --host 0.0.0.0 --port 8001"

echo =================================================
echo Checking Ollama Service Status...
echo =================================================
powershell -Command "try { $c = New-Object System.Net.Sockets.TcpClient('127.0.0.1', 11434); $c.Close(); exit 0 } catch { exit 1 }"
if errorlevel 1 (
  echo Ollama is offline. Starting Ollama engine...
  start "Ollama Engine" /min ollama serve
  
  echo Waiting for Ollama to initialize...
  :wait_ollama
  powershell -Command "try { $c = New-Object System.Net.Sockets.TcpClient('127.0.0.1', 11434); $c.Close(); exit 0 } catch { exit 1 }"
  if errorlevel 1 (
    timeout /t 1 >nul
    goto wait_ollama
  )
  echo Ollama started successfully!
) else (
  echo Ollama is already running.
)

echo Verifying Qwen3:14B model...
ollama run qwen3:14b "/bye" >nul 2>&1

echo =================================================
echo Starting backend (Express)...
echo =================================================
start "OrgAI Server" cmd /c "cd /d d:\waste\org-ai-platform\server && npm run dev"

echo =================================================
echo Starting frontend (Vite)...
echo =================================================
start "OrgAI Client" cmd /c "cd /d d:\waste\org-ai-platform\client && npm run dev"

echo -------------------------------------------------
echo   Backend listening on http://localhost:3001
echo   Voice Service on http://localhost:8001
echo   Frontend listening on http://localhost:5173
echo   Opening browser to the frontend URL...
echo -------------------------------------------------
start http://localhost:5173
pause
