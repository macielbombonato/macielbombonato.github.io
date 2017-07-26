---
layout: post
title: JSF - Página de erro após sessão expirada?
author: Maciel Escudero Bombonato
---

Mais um dos antigos migrados para cá.

# JSF - Página de erro após sessão expirada?

--------

Eu estava pegando sempre uma página de erro após muito tempo de inatividade em uma aplicação JSF ou quando reiniciava o servidor e clicava em algum link na página.

Para resolver esse problema chato, usei as seguintes linhas no web.xml da aplicação. 

	<error-page>
		<exception-type>
			javax.faces.application.ViewExpiredException
		</exception-type>
		<location> 
			/index.html 
		</location>
	</error-page> 

Com essas linhas no **web.xml** a aplicação ao invés de exibir a página de erro quando a view estiver expirada, vai redirecionar o usuário para a página indicada.