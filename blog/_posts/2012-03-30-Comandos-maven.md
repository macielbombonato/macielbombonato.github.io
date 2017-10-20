---
layout: post
title: Alguns comandos úteis para utilizar MAVEN
author: Maciel Escudero Bombonato
---

Mais um post antigo migrado pra cá. :)

--------

Abaixo vou listar algumas linhas de comando que podem ajudar no desenvolvimento de aplicações que usam MAVEN:

Criar uma aplicação:

	$ mvn archetype:generate -DgroupId=br.com.meusistema -DartifactId=AppExemplo -DarchetypeArtifactId=maven-archetype-quickstart -DinteractiveMode=false

Na primeira vez que este processo é executado, as coisas demoram um pouco por que o maven vai baixar meia internet no repositório local que ele cria na máquina.

Terminado o processo, você verá que o maven criou uma pasta com o nome que foi utilizado no artifactId, no nosso exemplo, "AppExemplo"

Depois disso, para que este projeto possa ser aberto no eclipse fácil, fácil, o comando é:

	$ cd AppExemplo

E dentro do diretório da aplicação:

	$ mvn eclipse:clean
	$ mvn eclipse:eclipse

ou

	$ mvn eclipse:m2eclipse

Na primeira vez deve demorar um pouco também.

Depois, basta importar o projeto no eclipse e seguir a vida.

Estou disponibilizando abaixo uma lista de comandos que normalmente uso.

	$ mvn clean
	$ mvn compile
	$ mvn install

Pretendo em uma hora com calma editar este post e incluir mais detalhes sobre cada operação descrita e incluir mais algumas que costumo usar.
