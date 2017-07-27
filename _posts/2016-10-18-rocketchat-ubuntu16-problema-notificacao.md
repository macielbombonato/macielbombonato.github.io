---
layout: post
title: Rocket.chat no Ubuntu 16 problemas nas notificações
author: Maciel Escudero Bombonato
---

Mais um migrado para cá.

# Rocket.chat no Ubuntu 16: problemas nas notificações

--------

Mais uma da linha para lembrança futura.

Quando atualizei minha máquina para o ubuntu 16 o rocket.chat começou a enviar as mensagens de notificação no formato de alerts clássicos (o que atrapalha bastante).

Procurando por uma solução para este problema, achei o seguinte post: [http://askubuntu.com/questions/766306/notifications-not-showing-up-properly-in-slack-and-other-electron-apps](http://askubuntu.com/questions/766306/notifications-not-showing-up-properly-in-slack-and-other-electron-apps) que basicamente indica que devemos executar o seguinte no console:

    sudo touch /usr/lib/libunity-electron_notification_fix 

Funcionou perfeitamente e as notificações passaram a ser aquelas "bunitinhas" no canto da tela.