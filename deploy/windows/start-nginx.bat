@echo off
setlocal EnableExtensions DisableDelayedExpansion
rem Port 80 requires an explicit argument AND a manually reviewed config change.
set "CECP_NGINX_PORT=8088"
if "%~1"=="80" set "CECP_NGINX_PORT=80"
if not "%~1"=="" if not "%~1"=="8088" if not "%~1"=="80" (
    echo Usage: start-nginx.bat [8088 or 80]
    exit /b 1
)
set "CECP_NGINX_HOME=C:\nginx"
set "CECP_NGINX_CONF=%~dp0nginx.conf"
set "CECP_NGINX_CONF=%CECP_NGINX_CONF:\=/%"

if not exist "%CECP_NGINX_HOME%\nginx.exe" (
    echo ERROR: Install the official Windows Nginx package at C:\nginx first.
    exit /b 1
)
if not exist "%~dp0nginx.conf" (
    echo ERROR: nginx.conf must be beside this script.
    exit /b 1
)
if not exist "%CECP_NGINX_HOME%\logs" mkdir "%CECP_NGINX_HOME%\logs"
if not exist "%CECP_NGINX_HOME%\logs" (
    echo ERROR: Cannot create C:\nginx\logs. Check folder permissions.
    exit /b 1
)
if exist "%CECP_NGINX_HOME%\logs\cecp-iem.pid" (
    echo ERROR: CECP-IEM PID file already exists. Use stop-nginx.bat first.
    echo For a stale PID file, follow README.md. No process was stopped.
    exit /b 1
)
pushd "%CECP_NGINX_HOME%" || exit /b 1
nginx.exe -p C:/nginx/ -c "%CECP_NGINX_CONF%" -t
if errorlevel 1 goto failed

powershell.exe -NoProfile -NonInteractive -Command "$c=Get-Content -LiteralPath $env:CECP_NGINX_CONF -Raw; $p=$env:CECP_NGINX_PORT; if ($c -notmatch ('listen\s+192\.168\.50\.10:'+ $p +'\s*;') -or $c -notmatch ('listen\s+127\.0\.0\.1:'+ $p +'\s*;')) { exit 1 }"
if errorlevel 1 goto failed
echo Starting CECP-IEM proxy on port %CECP_NGINX_PORT%...
start "" /b "%CECP_NGINX_HOME%\nginx.exe" -p C:/nginx/ -c "%CECP_NGINX_CONF%"
if errorlevel 1 goto failed
rem Verify this instance, rather than assuming START means Nginx is ready.
powershell.exe -NoProfile -NonInteractive -Command "$ErrorActionPreference='Stop'; for ($i=0; $i -lt 10; $i++) { Start-Sleep -Milliseconds 500; try { $n=Get-Content -LiteralPath 'C:\nginx\logs\cecp-iem.pid' -Raw; $p=Get-Process -Id ([int]$n); $listeners=Get-NetTCPConnection -State Listen -LocalPort ([int]$env:CECP_NGINX_PORT) -ErrorAction SilentlyContinue; if ($p.Path -eq 'C:\nginx\nginx.exe' -and ($listeners.LocalAddress -contains '192.168.50.10') -and ($listeners.LocalAddress -contains '127.0.0.1')) { exit 0 } } catch {} }; exit 1"
if errorlevel 1 goto failed
echo Ready: http://monitor.cecp.it:%CECP_NGINX_PORT%
echo No other service or Node/VBS startup configuration was changed.
popd
exit /b 0

:failed
echo ERROR: Nginx did not pass validation or startup checks.
echo Check C:\nginx\logs\cecp-iem-error.log and the README troubleshooting steps.
popd
exit /b 1
