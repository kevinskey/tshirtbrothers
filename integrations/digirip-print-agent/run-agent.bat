@echo off
rem Starts the DigiRIP print agent and keeps it running. Point a Task
rem Scheduler "At log on" task at this file (see README.md).
cd /d "%~dp0"
:loop
node agent.mjs
echo agent exited (%ERRORLEVEL%), restarting in 15s...
timeout /t 15 /nobreak >nul
goto loop
