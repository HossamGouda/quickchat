@echo off
set JAVA_HOME=C:\Program Files\Android\Android Studio\jbr
set ANDROID_HOME=C:\Users\hosgo\AppData\Local\Android\Sdk
cd /d "D:\Gouda Projects\direct-whatsapp\quickchat\android"
call gradlew.bat assembleDebug --no-daemon --console=plain > build.log 2>&1
echo EXIT=%ERRORLEVEL% >> build.log
