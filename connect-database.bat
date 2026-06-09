@echo off
echo ============================================================
echo  OrgAI — Connecting Your Database (one-time setup)
echo ============================================================
echo.
echo Your site is already live at:
echo   https://org-ai-platform-ashy.vercel.app
echo.
echo To activate user accounts and chat history, you need to
echo connect a free Postgres database. Follow these steps:
echo.
echo STEP 1: Create a free Neon database
echo   - Go to: https://neon.tech
echo   - Sign up (free, no credit card)
echo   - Click "New Project" - name it "orgai"
echo   - Copy the "Connection string" (starts with postgresql://)
echo.
echo STEP 2: Add the database URL to Vercel
echo   Run this command (replace YOUR_URL with the copied string):
echo.
echo   npx vercel env add DATABASE_URL production
echo   (paste your connection string when prompted)
echo.
echo STEP 3: Redeploy to apply the change
echo   npx vercel --prod
echo.
echo ============================================================
echo  OR use the Vercel dashboard (easier):
echo  - Go to vercel.com/dashboard
echo  - Click your project "org-ai-platform"
echo  - Settings → Environment Variables
echo  - Add: DATABASE_URL = (your Neon connection string)
echo  - Then go to Deployments → Redeploy
echo ============================================================
pause
