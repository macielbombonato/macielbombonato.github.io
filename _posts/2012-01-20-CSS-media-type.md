---
layout: post
title: CSS media type
author: Maciel Escudero Bombonato
---

Mais um dos antigos migrados para cá.

# CSS media type

--------

Ao criar uma página HTML, é possível fazer com que o visual da página seja diferente para diversos tipos de dispositivos de apresentação.

Uma forma bem simples de fazer isso é usando o parâmetro media ao criar o CSS na própria página ou no import de um arquivo CSS.

Abaixo dois exemplos básicos:

	<style type="text/css" media="print">
		body {
			Background-color: #FFFFFF;
		}
	</style>
	<style type="text/css" media="screen">
		body {
			Background-color: #CCCCCC;
		}
	</style>

Isso fará com que o fundo da página seja branca na página de impressa (OBS.: Os browsers costumam vir por padrão com a opção de impressão de imagens e cores de fundo desabilitada, ou seja, se outra cor fosse colocada, com essa configuração padrão, o fundo permaneceria branco) e na tela o fundo será um tom de cinza.

Quando não incluímos a opção media na criação do CSS, por padrão, seria como se tivessemos atribuido o valor “all” para esta propriedade.

Para importar um arquivo de estilos, o padrão é o mesmo:

	<link rel="stylesheet" href="css/impressao.css" media="print" />
	<link rel="stylesheet" href="css/tela.css" media="screen" />

Essa é a parte tranquila e básica da história, agora pode ocorrer a necessidade de fazer com que um HTML tenha que aparecer na tela de um jeito, ser impresso de outro e ainda ser enviado por email de outro jeito.

Este terceiro ponto pode ser um problema.

Navegando por sites a procura de coisas sobre o assunto encontrei o seguinte link que descreve um pouco a compatibilidade de cada programa de email com folhas de estilos:
Guide to CSS support in email

Para alguns pode ser bastante desanimador ao ver isso, e uma solução simples de implementar que achei de fato é descepcionante, mas, funcionou no caso de páginas JSP.

No meu caso, criei uma página JSP que recebe um parâmetro informando se ela será usada em um email ou não e ai, quando ela deverá ser utilizada no email ao invés de importar uma folha de estilos eu incluo o estilo diretamente no objeto, conforme exemplo abaixo:


	<td <%= email ? "style='text-align: left;'" : "class='tdDiferente'"%> >


É uma forma bem chata de tratar isso, mas no meu caso foi eficiênte.
