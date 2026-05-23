                            @echo off
chcp 65001 >nul
color 0A
echo.
echo ==============================================
echo      WhatsApp Рассылка жуйеси иске косылуда...
echo      (Бул терезени жаппаныз)
echo ==============================================
echo.

cd /d "%~dp0"

echo [1/2] Жоба папкасына кирди: %CD%
echo [2/2] Node.js сервери косылуда...
echo.

node server.js

if %ERRORLEVEL% NEQ 0 (
    color 0C
    echo.
    echo Кате пайда болды! Сервер дурыс косылмады.
    pause
)
