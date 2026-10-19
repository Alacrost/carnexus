# Pinturinha

App Android simples e offline para pintar a imagem aprovada.

- O dedo desenha um traço com textura de lápis, preso à área onde começou.
- Oito cores e largura de 4 a 60 unidades do desenho.
- Borracha com a mesma largura ajustável e proteção dos contornos.
- Desfazer remove o último traço ou a última ação de borracha.

O APK de teste fica em `output/Pinturinha.apk`. Transfira para o Android e abra para instalar. O Android poderá solicitar permissão de instalação para o aplicativo que abre o arquivo.

Requer Android 6 ou superior. Não solicita acesso à internet ou dados pessoais. O desenho em andamento fica apenas na sessão; fechar o app descarta a pintura.

## Compilação local

Execute `./build.ps1` no PowerShell. As ferramentas portáteis ficam em `.tools`, dentro deste projeto. O APK usa uma chave local de teste; não é uma versão publicada na Play Store.

## Verificação

Compilação Java/Android, assinatura e estrutura do APK, além da separação das áreas do desenho. A experiência de toque precisa ser validada em um dispositivo Android.
