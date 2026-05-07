@echo off
setlocal EnableExtensions EnableDelayedExpansion

:: Window Setup
title STI RAMS - Production Management Console
mode con: cols=90 lines=32
cd /d "%~dp0"

:: --- Configuration ---
set "HOST=0.0.0.0"
set "PORT=3000"
set "MAINT_PID_FILE=%TEMP%\sti-rams-maintenance-%PORT%.pid"
set "MAINT_STATUS_FILE=public\maintenance-status.txt"

if "%~1"=="watch_kill" (
    if not "%~2"=="" set "PORT=%~2"
    set "MAINT_PID_FILE=%TEMP%\sti-rams-maintenance-%PORT%.pid"
    set "MAINT_STATUS_FILE=public\maintenance-status.txt"
    call :setMaintenanceStatus "Stopping running services..."
    call :killProcess
    exit /b 0
)

if "%~1"=="watch_prestep" (
    if not "%~2"=="" set "PORT=%~2"
    set "MAINT_PID_FILE=%TEMP%\sti-rams-maintenance-%PORT%.pid"
    set "MAINT_STATUS_FILE=public\maintenance-status.txt"
    call :setMaintenanceStatus "Stopping running services..."
    call :killProcess
    call :setMaintenanceStatus "Enabling maintenance window..."
    call :startMaintenance
    call :cleanupBuildArtifacts
    call :setMaintenanceStatus "Building and redeploying application..."
    exit /b 0
)

if "%~1"=="watch_poststep" (
    if not "%~2"=="" set "PORT=%~2"
    set "MAINT_PID_FILE=%TEMP%\sti-rams-maintenance-%PORT%.pid"
    set "MAINT_STATUS_FILE=public\maintenance-status.txt"
    call :setMaintenanceStatus "Starting production services..."
    call :stopMaintenance
    exit /b 0
)

:mainMenu
:: Black background, Cyan text
color 0B
cls
echo.
echo  [94m   SSSSSSS  TTTTTTT  IIIIIII      RRRRRRR    AAAAA    MM     MM   SSSSSSS [0m
echo  [94m  SS         TTT      III       RR    RR  AA   AA   MMM   MMM  SS       [0m
echo  [94m   SSSSS     TTT      III       RRRRRRR  AAAAAAA   M  M M  M   SSSSS   [0m
echo  [94m       SS    TTT      III       RR  RR   AA   AA   M   M   M       SS  [0m
echo  [94m  SSSSSSS    TTT    IIIIIII     RR   RR  AA   AA   M       M  SSSSSSS  [0m
echo  [93m --------------------------------------------------------------------------- [0m
echo  [97m                  STI RAMS PRODUCTION MANAGEMENT CONSOLE                   [0m
echo  [93m --------------------------------------------------------------------------- [0m
echo.

:: Status Check
set "PIDS="
for /f "tokens=5" %%p in ('netstat -ano ^| findstr /R /C:":%PORT% .*LISTENING"') do (
    set "PIDS=%%p"
)

if defined PIDS (
    echo  [92m [STATUS] ONLINE [0m - Port: %PORT% ^| PID: %PIDS%
) else (
    echo  [91m [STATUS] OFFLINE [0m - Port: %PORT%
)
echo.
echo  [97m ACTIONS: [0m
echo  [93m [1] [0m Start Production Server
echo  [93m [2] [0m Stop Current Server
echo  [93m [3] [0m Restart (Stop ^> Start)
echo  [93m [4] [0m Build Project (Maintenance Aware)
echo  [93m [5] [0m Full Rebuild (Stop ^> Build ^> Start)
echo  [93m [6] [0m Auto-Watch ^& Rebuild (Nodemon)
echo  [93m [7] [0m Change Port
echo  [91m [8] [0m Exit
echo.
echo  [93m --------------------------------------------------------------------------- [0m

choice /c 12345678 /n /m " Enter Choice [1-8]: "
set "SEL=%ERRORLEVEL%"

if "%SEL%"=="1" goto op_start
if "%SEL%"=="2" goto op_stop
if "%SEL%"=="3" goto op_restart
if "%SEL%"=="4" goto op_build
if "%SEL%"=="5" goto op_full_rebuild
if "%SEL%"=="6" goto op_watch
if "%SEL%"=="7" goto op_port
if "%SEL%"=="8" exit /b 0

:: --- Logic Blocks ---

:op_start
echo.
echo  [94m[SYSTEM][0m Checking environment...
call :checkNode || goto mainMenu
call :ensureDeps || goto mainMenu
call :setMaintenanceStatus "Starting production services..."
call :stopMaintenance
call :waitForPortFree
if %ERRORLEVEL% NEQ 0 (
    echo  [91m[ERROR][0m Port %PORT% is still occupied. Attempting force cleanup...
    call :killProcess
    call :waitForPortFree
    if %ERRORLEVEL% NEQ 0 (
        echo  [91m[ERROR][0m Unable to free port %PORT%. Start aborted.
        pause
        goto mainMenu
    )
)
echo  [92m[SYSTEM][0m Launching Next.js on http://localhost:%PORT%
set "NODE_ENV=production"
set "DISABLE_REALTIME_MONITOR=true"
:: Using 'call' here is vital to prevent the script from exiting
call npm start -- -H %HOST% -p %PORT%
echo.
echo  [91m[SYSTEM][0m Server process stopped.
pause
goto mainMenu

:op_stop
echo.
call :killProcess
call :setMaintenanceStatus "Services stopped by administrator."
pause
goto mainMenu

:op_restart
echo.
echo  [94m[SYSTEM][0m Restarting service...
call :setMaintenanceStatus "Restart requested. Stopping services..."
call :killProcess
call :setMaintenanceStatus "Enabling maintenance window..."
call :startMaintenance
call :setMaintenanceStatus "Starting production services..."
goto op_start

:op_build
echo.
echo  [94m[SYSTEM][0m Running Maintenance-Aware Production Build...
call :checkNode || goto mainMenu
call :ensureDeps || goto mainMenu
set "BUILD_WAS_RUNNING="
set "BUILD_PIDS="
for /f "tokens=5" %%p in ('netstat -ano ^| findstr /R /C:":%PORT% .*LISTENING"') do set "BUILD_PIDS=%%p"
if defined BUILD_PIDS set "BUILD_WAS_RUNNING=1"
call :setMaintenanceStatus "Stopping services before build..."
call :killProcess
call :setMaintenanceStatus "Enabling maintenance window..."
call :startMaintenance
call :cleanupBuildArtifacts
call :setMaintenanceStatus "Building production assets..."
call npm run build
if %ERRORLEVEL% NEQ 0 (
    echo.
    echo  [91m[ERROR][0m Build failed! Review the errors above.
    echo  [33m[INFO][0m Maintenance page remains online until the next successful build/start.
    call :setMaintenanceStatus "Build failed. Waiting for fixes..."
) else (
    call :setMaintenanceStatus "Build complete. Restoring application..."
    call :stopMaintenance
    echo  [92m[SUCCESS][0m Build completed.
    if defined BUILD_WAS_RUNNING (
        echo  [94m[SYSTEM][0m Previous server was online. Starting production server...
        goto op_start
    )
)
pause
goto mainMenu

:op_full_rebuild
echo.
echo  [95m[FULL REBUILD][0m Phase 1: Stopping Server...
call :setMaintenanceStatus "Full rebuild: stopping services..."
call :killProcess
echo  [95m[FULL REBUILD][0m Phase 1.5: Enabling Maintenance Page...
call :setMaintenanceStatus "Full rebuild: enabling maintenance window..."
call :startMaintenance
echo  [95m[FULL REBUILD][0m Phase 2: Building Assets...
call :cleanupBuildArtifacts
call :setMaintenanceStatus "Full rebuild: building production assets..."
call npm run build
if %ERRORLEVEL% NEQ 0 (
    echo  [91m[ERROR][0m Rebuild aborted due to build errors.
    echo  [33m[INFO][0m Maintenance page remains online until the build passes.
    call :setMaintenanceStatus "Full rebuild failed. Waiting for fixes..."
    pause
    goto mainMenu
)
call :setMaintenanceStatus "Full rebuild complete. Restoring application..."
call :stopMaintenance
echo  [95m[FULL REBUILD][0m Phase 3: Starting Server...
goto op_start

:op_watch
echo.
echo  [94m[SYSTEM][0m Starting Auto-Watch ^& Rebuild Mode...
echo  [33m[INFO][0m This feature monitors core project directories.
echo  [33m[INFO][0m Every source code change triggers Full Stop -^> Rebuild -^> Start.
echo  [91m[!][0m To quit this mode, manually press Ctrl+C to terminate the batch script.
echo.
call :killProcess
call :setMaintenanceStatus "Watch mode active. Waiting for file changes..."
set "NODE_ENV=production"
set "DISABLE_REALTIME_MONITOR=true"
call npx -y nodemon --watch app --watch components --watch lib --watch public --watch styles --watch hooks --watch middleware.ts --watch .env.local --ext ts,tsx,js,jsx,css,json,mjs,env --ignore node_modules/ --ignore .next/ --ignore logs/ --exec "call production.bat watch_prestep %PORT% && call npm run build && call production.bat watch_poststep %PORT% && call npm start -- -H %HOST% -p %PORT%"
echo.
echo  [91m[SYSTEM][0m Watcher terminated.
call :stopMaintenance
pause
goto mainMenu

:op_port
echo.
set /p "NP= Enter Port [1024-65535]: "
echo %NP%| findstr /r "^[0-9][0-9]*$" >nul
if %ERRORLEVEL% EQU 0 (
    set "PORT=%NP%"
    echo  [92m[OK][0m Port set to %PORT%.
) else (
    echo  [91m[ERROR][0m Invalid input.
)
pause
goto mainMenu

:: --- Sub-Routines ---

:killProcess
set "TEMP_PIDS="
set "TEMP_PIDS="
for /f "tokens=5" %%p in ('netstat -ano ^| findstr /R /C:":%PORT% .*LISTENING"') do (
    echo !TEMP_PIDS! | findstr /R /C:"\<%%p\>" >nul || set "TEMP_PIDS=!TEMP_PIDS! %%p"
)
if defined TEMP_PIDS (
    for %%p in (!TEMP_PIDS!) do (
        echo  [94m[SYSTEM][0m Killing process %%p on port %PORT%...
        taskkill /PID %%p /F >nul 2>&1
    )
    call :waitForPortFree
    if !ERRORLEVEL! EQU 0 (
        echo  [92m[SYSTEM][0m Port %PORT% is now free.
    ) else (
        echo  [91m[ERROR][0m Port %PORT% is still occupied after kill attempt.
    )
) else (
    echo  [33m[INFO][0m No active process found on port %PORT%.
)
exit /b 0

:waitForPortFree
set "_TRIES=0"
:waitLoop
set /a _TRIES+=1
set "_PORT_BUSY="
for /f "tokens=5" %%p in ('netstat -ano ^| findstr /R /C:":%PORT% .*LISTENING"') do set "_PORT_BUSY=1"
if not defined _PORT_BUSY exit /b 0
if %_TRIES% GEQ 20 exit /b 1
timeout /t 1 /nobreak >nul
goto waitLoop

:startMaintenance
if exist "%MAINT_PID_FILE%" (
    for /f "usebackq delims=" %%p in ("%MAINT_PID_FILE%") do set "MPID=%%p"
    if defined MPID (
        tasklist /FI "PID eq !MPID!" | findstr /I "node.exe" >nul
        if !ERRORLEVEL! EQU 0 (
            echo  [33m[INFO][0m Maintenance page already running on port %PORT%.
            exit /b 0
        )
    )
    del "%MAINT_PID_FILE%" >nul 2>&1
)

powershell -NoProfile -Command "$p = Start-Process -WindowStyle Hidden -FilePath node -ArgumentList 'scripts/maintenance-server.js','%PORT%' -PassThru; Set-Content -Path '%MAINT_PID_FILE%' -Value $p.Id"
if %ERRORLEVEL% EQU 0 (
    echo  [92m[SYSTEM][0m Maintenance page is live at http://localhost:%PORT%
) else (
    echo  [91m[ERROR][0m Failed to start maintenance page server.
)
exit /b 0

:stopMaintenance
if not exist "%MAINT_PID_FILE%" exit /b 0
set "MPID="
for /f "usebackq delims=" %%p in ("%MAINT_PID_FILE%") do set "MPID=%%p"
if defined MPID (
    taskkill /PID !MPID! /F >nul 2>&1
)
del "%MAINT_PID_FILE%" >nul 2>&1
call :setMaintenanceStatus "Production services online."
exit /b 0

:setMaintenanceStatus
set "MS_TEXT=%~1"
if "%MS_TEXT%"=="" set "MS_TEXT=Updating system..."
> "%MAINT_STATUS_FILE%" echo %MS_TEXT%
>> "%MAINT_STATUS_FILE%" echo %DATE% %TIME%
exit /b 0

:cleanupBuildArtifacts
echo  [SYSTEM] Preparing clean build workspace...

if exist ".next\cache\webpack" (
    rmdir /s /q ".next\cache\webpack" >nul 2>&1
)

if exist ".next\export" (
    call :removeDirWithRetry ".next\export"
)

exit /b 0

:removeDirWithRetry
set "_TARGET_DIR=%~1"
if "%_TARGET_DIR%"=="" exit /b 0
if not exist "%_TARGET_DIR%" exit /b 0

set "_RTRIES=0"
:removeDirRetryLoop
set /a _RTRIES+=1
rmdir /s /q "%_TARGET_DIR%" >nul 2>&1
if not exist "%_TARGET_DIR%" exit /b 0

if %_RTRIES% GEQ 5 (
    powershell -NoProfile -Command "if (Test-Path -LiteralPath '%_TARGET_DIR%') { Remove-Item -LiteralPath '%_TARGET_DIR%' -Recurse -Force -ErrorAction SilentlyContinue }" >nul 2>&1
    if not exist "%_TARGET_DIR%" exit /b 0
)

if %_RTRIES% GEQ 8 (
    echo  [WARN] Could not fully clear %_TARGET_DIR% before build. Continuing anyway...
    exit /b 0
)

timeout /t 1 /nobreak >nul
goto removeDirRetryLoop

:checkNode
where node >nul 2>&1 || (echo [91m[!] Node not found.[0m & exit /b 1)
exit /b 0

:ensureDeps
if not exist node_modules\ (
    echo  [94m[SYSTEM][0m Installing node_modules...
    call npm install
)
exit /b 0



