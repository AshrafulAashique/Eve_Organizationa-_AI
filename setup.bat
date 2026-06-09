@echo off
title Org AI Platform – Model Setup

echo -------------------------------------------------
echo   Pulling required Ollama models (offline only once)
echo   This may take several minutes depending on your connection
echo -------------------------------------------------

:: Ensure ollama is in PATH
where ollama >nul 2>&1
if errorlevel 1 (
  echo Ollama not found in PATH. Please install Ollama and add it to your system PATH.
  pause
  exit /b 1
)

ollama pull llama3.2:3b

echo.
echo All models downloaded. You can now start the platform.
pause
