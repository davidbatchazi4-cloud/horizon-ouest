@echo off
rem Lance le serveur FastAPI puis ouvre le tableau de bord dans le navigateur.
cd /d "%~dp0"
echo.
echo   Tableau de bord : http://127.0.0.1:8000
echo   Documentation de l API : http://127.0.0.1:8000/docs
echo   Messages recus (administrateur) : http://127.0.0.1:8000/admin.html
echo   (mot de passe : backend\mot_de_passe_admin.txt, cree au premier essai)
echo   (fermez cette fenetre pour arreter le serveur)
echo.
start "" powershell -NoProfile -WindowStyle Hidden -Command "Start-Sleep -Seconds 3; Start-Process 'http://127.0.0.1:8000'"
python -m uvicorn backend.main:app --port 8000
pause
