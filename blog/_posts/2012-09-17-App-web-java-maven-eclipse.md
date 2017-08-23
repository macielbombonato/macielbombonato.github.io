---
layout: post
title: App web Java + Maven não roda no ecplise
author: Maciel Escudero Bombonato
---

Mais um dos antigos migrados para cá.

# App web Java + Maven não roda no ecplise

--------

Imagine que você desenvolveu uma aplicação java com maven e versionou ela em algum repositório da vida, por exemplo, github, e ao instalá-la em outro computador ela apresenta a seguinte mensagem quando o servidor sobe:

	Error configuring application listener of class org.springframework.web.context.ContextLoaderListener

Consultando este problema na internet achei a seguinte solução:

1. Abre as propriedades do projeto (botão direito no projeto e propriedades); 
2. Selecione "Deployment Assembly";
3. Clique em "Add...";
4. Selecione "Java Build Path Entries" e clique em "Next";
5. Selecione "Maven Dependencies" e clique "Finish";

Reinicie seu servidor tomcat e veja que agora funciona.

Essas dicas foram retiradas do post [6210757 - java-lang-classnotfoundexception-org-springframework-web-context-contextloaderl no stackoverflow.com](http://stackoverflow.com/questions/6210757/java-lang-classnotfoundexception-org-springframework-web-context-contextloaderl)