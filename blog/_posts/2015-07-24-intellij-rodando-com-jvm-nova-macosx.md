---
layout: post
title: IntelliJ IDEA rodando com JVM mais nova no MAC OS X
author: Maciel Escudero Bombonato
---

Mais um dos antigos migrados para cá.

--------

Caso tenha atualizado seu MAC OS X e após isso passou a receber a mensagem que o IntelliJ IDEA precisa rodar em uma versão legada (legacy) da JVM, a solução para mim foi a seguinte.

No terminal:

	cd /Applications/IntelliJ\ IDEA\ 14.app/Contents
	vi Info.plist

OBS.: O número 14 no caminho acima é a versão do meu IntelliJ, mude esse número para a sua versão da aplicação.

Após isso, digite `/` para habilitar a busca e em seguida digite `JVMVersion` e `enter`.

Note que logo abaixo da string encontrada vc verá a versão 1.6*. Mude o 6 por 8 e em seguida salve o documento `esc` + `wq` + `enter`.

Tente abrir o Intellij novamente. ;-)
