---
layout: post
title: Instalação/Preparação do Diaspora para desenvolvimento
author: Maciel Escudero Bombonato
description: Passo a passo para instalar e preparar o ambiente de desenvolvimento da rede social Diaspora usando RVM, bundler e configuração de banco.

tags: [ruby, rvm, diaspora, setup, dev]
topics: [tooling, development]
---

Outro daqueles posts relâmpago. :)

--------

Primeiros passos, preparando a casa:

Instalação do rvm:
	bash < .rvmrc
	cd .
	rvm gemset create ‘diaspora’
	cd ..
	cd diaspora

Confirme as mensagens que aparecem.

	bundle install

Tire a palavra exemplo do nome do arquivo **database.yml**, certifique-se de que as configurações de banco de dados que estão no arquivo conferem com as da sua máquina.

Tire a palavra exemplo do nome do arquivo **app_config.yml**.

No terminal execute o comando:

	rake db:create db:migrate

Pronto!

Agora é só personalizar a aplicação.
