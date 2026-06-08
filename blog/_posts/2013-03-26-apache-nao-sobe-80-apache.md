---
layout: post
title: Apache não sobe na porta 80
author: Maciel Escudero Bombonato
description: Por que o Apache não consegue subir na porta 80 quando o Skype está rodando, e como liberar a porta nas configurações de conexão do Skype.

tags: [apache, web, network, skype, debugging, port]
topics: [troubleshooting]
---

Mais um dos antigos migrados para cá.

--------

Instalei o Apache algumas vezes pra rodar algumas aplicações de teste no meu ambiente de desenvolvimento.

Normalmente eu não conseguia fazer com que ele subisse na porta 80 até descobrir que o Skype era o responsável por isso (o próprio Apache entrega isso).

Pra acabar com este conflito, no Skype, vá até Ferramentas, Opções e Conexão, em seguida desative o primeiro check box (como na imagem abaixo), clique em salvar e reinicie o skype.

![-fullwidth](/images/posts/2013-03-26-apache-nao-sobe-80-apache/skype-conf.PNG)

Agora este não é mais um problema para subir o Apache.
