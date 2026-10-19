$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot
$jdk = (Get-ChildItem -LiteralPath '.tools\jdk' -Directory | Select-Object -First 1).FullName
$env:JAVA_HOME = $jdk
$env:PATH = "$jdk\bin;$env:PATH"
$sdk = Join-Path $PSScriptRoot '.tools\sdk'
$tools = Join-Path $sdk 'build-tools\35.0.0'
$android = Join-Path $sdk 'platforms\android-35\android.jar'
function Check-Exit { if ($LASTEXITCODE -ne 0) { throw "A compilação falhou: $LASTEXITCODE" } }
New-Item -ItemType Directory -Force -Path 'build\classes','build\dex','output' | Out-Null
$sources = @(Get-ChildItem -LiteralPath 'app\src\main\java\com\pinturinha\app' -Filter '*.java' | ForEach-Object { $_.FullName })
& "$jdk\bin\javac.exe" -encoding UTF-8 -source 8 -target 8 -classpath $android -d 'build\classes' @sources
Check-Exit
& "$jdk\bin\jar.exe" cf 'build\classes.jar' -C 'build\classes' .
Check-Exit
& "$tools\d8.bat" --lib $android --min-api 23 --output 'build\dex' 'build\classes.jar'
Check-Exit
& "$tools\aapt.exe" package -f -M 'app\src\main\AndroidManifest.xml' -I $android -A 'app\src\main\assets' -F 'build\unsigned.apk'
Check-Exit
& "$jdk\bin\jar.exe" uf 'build\unsigned.apk' -C 'build\dex' 'classes.dex'
Check-Exit
& "$tools\zipalign.exe" -f -p 4 'build\unsigned.apk' 'build\aligned.apk'
Check-Exit
if (-not (Test-Path -LiteralPath '.tools\test-signing.jks')) {
    & "$jdk\bin\keytool.exe" -genkeypair -keystore '.tools\test-signing.jks' -storepass android -keypass android -alias pinturinha -dname 'CN=Pinturinha Teste' -keyalg RSA -keysize 2048 -validity 10000
    Check-Exit
}
& "$tools\apksigner.bat" sign --ks '.tools\test-signing.jks' --ks-key-alias pinturinha --ks-pass pass:android --key-pass pass:android --out 'output\Pinturinha.apk' 'build\aligned.apk'
Check-Exit
& "$tools\apksigner.bat" verify --verbose 'output\Pinturinha.apk'
Check-Exit
& "$tools\aapt.exe" dump badging 'output\Pinturinha.apk'
Check-Exit
