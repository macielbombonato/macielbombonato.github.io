---
layout: post
title: Assinando um JAR (JAVA WEB START)
author: Maciel Escudero Bombonato
---

Mais um dos antigos migrados para cá.

# Assinando um JAR (JAVA WEB START)

--------

Toda vez que criamos uma aplicação Java Web Start e precisamos que esta aplicação tenha alguns acessos a máquina cliente, é necessário incluir no arquivo JNLP a seguinte instrução:

	<security>
		<all-permissions/>
	</security>

O problema é que feito isso, é necessário assinar os jars que estão na lista que deve ser entregue a máquina cliente, abaixo criei um tutorial bem simples de como fazer isso.

Primeiro, no diretório onde estão os jars, digite a linha de comando que segue:

	keytool -genkey -alias macielbombonato -keystore macielbombonato.cert

Escolha a senha (minimo de 6 caracteres):

	Enter keystore password:
	Re-enter new password:

Responda o questionário:

	What is your first and last name?
	[Unknown]: XXX
	What is the name of your organizational unit?
	[Unknown]: XXX
	What is the name of your organization?
	[Unknown]: XXX
	What is the name of your City or Locality?
	[Unknown]: XXX
	What is the name of your State or Province?
	[Unknown]: XX
	What is the two-letter country code for this unit?
	[Unknown]: XX
	
	Is CN=XXX, OU=XXX, O=XXX, L=XXX, ST=XX, C=XX correct?
	[no]: yes

Esses passos acima vão criar um certificado na pasta onde os jars estão, agora é necessário assinar cada um dos jars com esse certificado, para isso, basta utilizar a linha de comando abaixo:

	jarsigner -verbose -keystore macielbombonato.cert -storepass 123456 -keypass 123456 MeuJarAssinadoWebStart.jar macielbombonato

Caso não queira incluir as senhas nas linhas de comando para assinar os jars, basta não utilizar os parâmetros -storepass e -keypass, com isso, a senha será solicitada antes do jar ser assinado.

