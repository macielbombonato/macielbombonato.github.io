---
layout: post
title: macOS - Bootable USB
author: Maciel Escudero Bombonato
---

Neste post descrevo (pra mim no futuro) como gerar o pendrive bootável de instalação do macOS em algumas versões e quais os links de download (a busca da apple store é bem ruim as vezes).

---

## Antes de começar

Os comandos são basicamente divididos em duas partes, o comando em si pra gerar o bootável de cada versão e o volume (pendrive) de destino. Abaixo nos comandos de exemplo, as partes relacionadas a cada versão devem servir em qualquer computador, mas a parte de volume deve ser ajustada para o nome da sua mídia.

## 10.15: Catalina

Faça o download aqui [https://apps.apple.com/app/macos-catalina/id1466841314?mt=12](https://apps.apple.com/app/macos-catalina/id1466841314?mt=12).

Depois execute no terminal:

```
sudo /Applications/Install\ macOS\ Catalina.app/Contents/Resources/createinstallmedia --volume /Volumes/MACIEL --nointeraction && say Hi boss, I\'m done here
```

## 10.14: Mojave

Faça o download aqui [https://apps.apple.com/app/macos-mojave/id1398502828?mt=12](https://apps.apple.com/app/macos-mojave/id1398502828?mt=12).

Depois execute no terminal:

```
sudo /Applications/Install\ macOS\ Mojave.app/Contents/Resources/createinstallmedia --volume /Volumes/MACIEL --nointeraction && say Hi boss, I\'m done here
```
