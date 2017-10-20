---
layout: post
title: Configure Proxy para subversion
author: Maciel Escudero Bombonato
---

Mais um dos antigos migrados para cá.

--------

Essa dica vale pra quem precisa configurar proxy para utilização do subversion no sistema operacional como um todo ou para a utilização do plugin do eclipse o subclipse.

Para quem estiver utilizando o sistema operacional Windows, um amigo achou na net a seguinte referencia: [http://ykyuen.wordpress.com/2010/03/09/eclipse-configure-proxy-for-subclipse/](http://ykyuen.wordpress.com/2010/03/09/eclipse-configure-proxy-for-subclipse/)

Abaixo irei colocar o texto retirado deste site para o caso do post algum dia sair do ar.

>The Eclipse proxy setting does not apply on subclipse. So you cannot connect to a SVN repostory outside your firewall even you have set the proxy in Eclipse.

>Luckily, i found the solution in MKVille Blog – Using Subclipse Behind a Proxy Server.

>For Windows XP user

>Open the C:\Documents and Settings\\Application Data\Subversion\servers
Configure the http-proxy-host and http-proxy-port settings under the [global] tag

>For Windows 7 user

>Open the C:\Users\\AppData\Roaming\Subversion\servers
Configure the http-proxy-host and http-proxy-port settings under the [global] tag

>Done =)

Agora a pergunta, porque estou reescrevendo este post?

Para dar a dica para quem usa mac (ou linux).

No caso, basta realizar basicamente os mesmos passos que o autor do post original comentou, porém, usuários de mac devem usar o seguinte endereço:

	/Users/[nome_do_usuario]/.subversion

Agora só preciso arrumar um tempo pra montar uns scripts pra ativar e desativar o proxy para quem é consultor e vai e vem para clientes.

Espero que este post ajude mais alguém.
