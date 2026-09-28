@echo off
setlocal EnableExtensions DisableDelayedExpansion
set "CECP_NGINX_HOME=C:\nginx"
set "CECP_NGINX_CONF=%~dp0nginx.conf"
set "CECP_NGINX_CONF=%CECP_NGINX_CONF:\=/%"
if not exist "%CECP_NGINX_HOME%\nginx.exe" (
    echo ERROR: C:\nginx\nginx.exe was not found.
    exit /b 1
)
if not exist "%~dp0nginx.conf" (
    echo ERROR: nginx.conf must be beside this script.
    exit /b 1
)
if not exist "%CECP_NGINX_HOME%\logs\cecp-iem.pid" (
    echo CECP-IEM Nginx is not running: no dedicated PID file exists.
    exit /b 0
)
rem Refuse to signal a stale PID that now belongs to another application.
powershell.exe -NoProfile -NonInteractive -Command "$ErrorActionPreference='Stop'; try { $n=Get-Content -LiteralPath 'C:\nginx\logs\cecp-iem.pid' -Raw; $p=Get-Process -Id ([int]$n); if ($p.Path -ne 'C:\nginx\nginx.exe') { exit 1 }; exit 0 } catch { exit 1 }"
if errorlevel 1 (
    echo ERROR: PID is stale or cannot be verified. No process was signalled.
    echo See README.md before removing a stale PID file.
    exit /b 1
)
pushd "%CECP_NGINX_HOME%" || exit /b 1
nginx.exe -p C:/nginx/ -c "%CECP_NGINX_CONF%" -s quit
if errorlevel 1 (
    echo ERROR: Could not request graceful shutdown. Check the error log.
    popd
    exit /b 1
)
echo Graceful shutdown requested for CECP-IEM Nginx only.
echo Wait for C:\nginx\logs\cecp-iem.pid to disappear before starting again.
popd
exit /b 0
