@echo off
rem Build APK release va cai len dien thoai (mo bang double-click).
rem Tu dong fix loi va thu lai truoc khi bao that bai.
cd /d %~dp0

rem --- Buoc 1: prebuild (fix: xoa android va chay lai voi --clean) ---
call npx expo prebuild -p android
if errorlevel 1 (
    echo [FIX] Prebuild loi - xoa thu muc android va lam lai voi --clean...
    if exist android rmdir /s /q android
    call npx expo prebuild -p android --clean
    if errorlevel 1 goto :fail
)

cd android

rem --- Buoc 2: assembleRelease (fix: clean build roi chay lai) ---
call gradlew.bat assembleRelease
if errorlevel 1 (
    echo [FIX] Build loi - chay clean build...
    call gradlew.bat clean
    if errorlevel 1 goto :fail
    call gradlew.bat assembleRelease
    if errorlevel 1 goto :fail
)

cd ..

rem --- Buoc 3: cai dat (fix: khoi dong lai adb va cai lai) ---
adb install -r android\app\build\outputs\apk\release\app-release.apk
if errorlevel 1 (
    echo [FIX] Cai dat loi - khoi dong lai adb server va thu lai...
    adb start-server
    adb wait-for-device
    adb install -r android\app\build\outputs\apk\release\app-release.apk
    if errorlevel 1 goto :fail
)

echo.
echo [OK] Build va cai dat thanh cong.
pause
exit /b 0

:fail
echo.
echo [LOI] Qua trinh build/cai dat that bai sau khi da thu fix.
pause
exit /b 1
