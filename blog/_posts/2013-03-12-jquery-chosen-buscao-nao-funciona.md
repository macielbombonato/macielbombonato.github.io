---
layout: post
title: jquery-chosen - Busca de termos não funciona
author: Maciel Escudero Bombonato
---

Mais um dos antigos migrados para cá.

--------

Incluindo o chosen em algumas de minhas páginas (sistemas) notei que um probleminha estava acontecendo. Toda vez que eu tentava preencher com alguns caracteres para ele filtrar os termos e facilitar minha escolha eu recebia a mensagem de que o termo não foi encontrado, porém, quando o termo possuia mais de uma palavra e eu preenchia os caracteres relativos a esta segunda palavra, a busca funcionava.

A solução para isso é bem simples, basta retirar a identação deste ponto da página, por exemplo, quando colocado conforme abaixo:

	<option>     
	    Valor a escolher
	</option>

Se você preencher o termo de busca com "esco" ele vai encontrar o termo, porém, se colocar "valo" o termo não será encontrado.

Agora, sem a identação:

	<option>Valor a escolher</option>

A busca funciona normalmente.
