---
layout: post
title: Utilizando Git na linha de comando
author: Maciel Escudero Bombonato
---

Um post com dicas e comandos git.

--------

Versionando um diretório local com git.

Dentro do diretório executar o comando:

	git init

E depois:

Status do branch selecionado

	git status

Exibe todos os branchs e marca com um asterisco o que está selecionado.

	git branch

Fazer stage dos arquivos (marcá-los para versionar)

	git add

- . (ponto) adiciona todos arquivos que estão pendentes
- [nome do arquivo] adiciona um arquivo específico

Criar um branch

	git checkout -b [nome do branch]

Commit das alterações

	git commit -am “[mensagem]”

Altera do branch atual para o branch mencionado

	git checkout [nome do branch]

Para pegar as alterações do branch master para outro branch qualquer:

	git checkout [nome do branch]
	git rebase master

Para mandar as informações de um branch qualquer para o master:

	git checkout master
	git merge [nome do branch]

No caso do branch master ser remoto:

Para atualizar seu master local:

	git checkout master
	git pull origin master

Atualizar o branch master remoto com suas alterações locais:

	git checkout master
	git push origin master

---

### **Editado (25/04/2012) - Inclusão de repositório remoto**.

---

Os passos acima foram seguidos e o projeto está sendo versionado localmente apenas, porém, em dado momento eis que surge um servidor git para que o projeto seja versionado, neste caso, o git oferece recursos bem simples de alteração do repositório que o projeto deve apontar, para isso basta:

Fazer com que o host remoto git do seu projeto passe a ser este indicado na url

	$ git remote add origin https://enderecodoseuservidor/aplicacao.git

Para enviar os fontes para o branch master remoto pela primeira vez

	$ git push -u origin master
