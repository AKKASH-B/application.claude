@echo off
setlocal
cd /d "%~dp0"
if not exist logs mkdir logs
echo [1/5] npm install ...
call npm install --legacy-peer-deps > logs\1-install.log 2>&1
echo      exit code %errorlevel%
echo [2/5] aligning Expo package versions ...
call npx --yes expo install --fix -- --legacy-peer-deps > logs\2-expo-fix.log 2>&1
echo      exit code %errorlevel%
echo [3/5] type-check ...
call npx tsc --noEmit > logs\3-typecheck.log 2>&1
echo      exit code %errorlevel%
echo [4/5] unit tests ...
call npm test > logs\4-tests.log 2>&1
echo      exit code %errorlevel%
echo [5/5] web build ...
call npx expo export --platform web > logs\5-web-build.log 2>&1
echo      exit code %errorlevel%
echo Done. See the logs folder.
