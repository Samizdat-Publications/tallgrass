@echo off
REM One-time setup: copies the Claude Code config (stop hook, subagents, settings)
REM from _claude_setup into .claude. Run this BEFORE opening the folder in Claude Code.
xcopy "%~dp0_claude_setup" "%~dp0.claude\" /E /I /Y >nul
if exist "%~dp0.claude\settings.json" (
  echo.
  echo Done. .claude is set up: stop hook, blind-critic and builder agents, settings.
  echo Now open this folder in Claude Code.
) else (
  echo.
  echo Something went wrong: .claude\settings.json was not created.
)
where python >nul 2>nul
if errorlevel 1 (
  echo WARNING: "python" is not on PATH, so the keep-going hook will not run.
) else (
  echo python found on PATH: keep-going hook will work.
)
echo.
pause
