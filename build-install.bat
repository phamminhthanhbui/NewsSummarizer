@echo off
rem Build APK release va cai len dien thoai (mo bang double-click).
cd /d %~dp0

rem --- Buoc 1: kiem tra dien thoai (can co de cai APK) ---
echo Kiem tra thiet bi...
adb get-state >nul 2>&1
if errorlevel 1 (
    echo [LOI] Khong thay dien thoai. Kiem tra:
    echo   1. Cap USB da cam vao may tinh
    echo   2. Tren dien thoai bat "USB debugging" ^(Nha phat trien^)
    echo   3. Chon "Cho phep" khi dien thoai hoi cho phep may tinh
    echo Danh sach thiet bi:
    adb devices
    goto :fail
)

rem --- Buoc 2: prebuild ---
call npx expo prebuild -p android
if errorlevel 1 goto :fail

cd android

rem --- Buoc 3: assembleRelease ---
call .\gradlew.bat assembleRelease
if errorlevel 1 goto :fail

cd ..

rem --- Buoc 4: cai dat ---
rem Xoa clone "Dual apps" (Samsung DUAL_APP user) neu co de khong bi 2 icon
for /f "tokens=2 delims={:" %%a in ('adb shell pm list users ^| findstr DUAL_APP') do set DUAL_USER=%%a
if defined DUAL_USER (
    echo Xoa app khoi Dual apps ^(user %DUAL_USER%^)...
    adb uninstall --user %DUAL_USER% com.autoship.NewsSummarizer >nul 2>&1
)
adb install -r android\app\build\outputs\apk\release\app-release.apk
if errorlevel 1 goto :fail

rem Samsung Dual apps tu tao lai clone sau khi install -> xoa them lan nua
if defined DUAL_USER (
    adb uninstall --user %DUAL_USER% com.autoship.NewsSummarizer >nul 2>&1
)

echo.
echo [OK] Build va cai dat thanh cong.
pause
exit /b 0

:fail
echo.
echo [LOI] Qua trinh build/cai dat that bai.
pause
exit /b 1
