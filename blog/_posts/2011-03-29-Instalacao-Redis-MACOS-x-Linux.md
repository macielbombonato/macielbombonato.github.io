---
layout: post
title: Instalação Redis MacOS X e Linux em 30s
author: Maciel Escudero Bombonato
description: Como instalar o Redis em macOS e Linux em 30 segundos usando make install, com os pré-requisitos para cada sistema operacional.
tags: [redis, macos, linux, devops, setup, database]
topics: [tooling, devops-cloud]
---

Um daqueles posts relâmpago. :)

--------

Acesse: [http://redis.io/](http://redis.io/)

Baixe o último release em algum local da sua máquina.

Descompacte e via terminal execute o seguite comando na pasta do redis.

	sudo make install

Após a conclusão da instalação, basta executar o comando:

	redis-server

Pronto!

Pré requisitos:

- MacOS X: Xcode
- Debian/Ubuntu: Pacote build-essential (sudo apt-get install build-essential).
