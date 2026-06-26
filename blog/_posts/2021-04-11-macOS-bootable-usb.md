---
layout: post
title: macOS - Bootable USB
author: Maciel Escudero Bombonato
description: Comandos de terminal para gerar pendrives bootáveis de instalação do macOS (Catalina e Mojave) usando createinstallmedia, com links de download oficiais.
logo: https://cdn.simpleicons.org/macos

tags: [macos, bootable-usb, installer, system, terminal]
topics: [tooling, so]
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

## `atualização em 20/06/2026`

Caso vá tentar pegar um macOS antigo usando um mac novo pode ser que não consiga fazer o download pela apple store, nesse caso, o jeito mais fácil que encontrei de essas versões antigas foi usando o open core.

### Os passos são os seguintes:

1. Baixe o [OpenCore-Patcher.pkg](https://github.com/dortania/OpenCore-Legacy-Patcher/releases) no GitHub oficial (aqui deixei link para o site pra que você escolha a última versão disponível).

2. Extraia, mova o app para a pasta Aplicativos e abra-o.

3. Na tela inicial do programa, clique no botão Create macOS Installer (Criar Instalador do macOS).

4. Escolha a opção Download macOS Installer. O programa vai puxar a lista de servidores da Apple.

5. Escolha a versão que deseja.

6. O próprio programa vai extrair o pacote e colocá-lo na pasta de Aplicativos do macOS. Aí é só seguir os passos indicados anteriormente substituindo para a versão do SO que você baixou.