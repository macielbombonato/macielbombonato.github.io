---
layout: post
title: Passo a passo para montar uma página com Jekyll
author: Maciel Escudero Bombonato
---

Este post descreve como criei este site, sua estrutura e o que é necessário para deixar tudo funcionando.

--------

Quase todo mundo que monta um blog/página pessoal no github pages faz um post dizendo como montou esse blog, para não ser diferente, vamos lá fazer a mesma coisa. :-)

Eu comecei lendo posts do meu amigo [Leonardo Rifeli](https://leonardorifeli.com). Daí, sai fazendo testes e olhando alguns outros pontos na internet e disso montei este site que ainda estou resolvendo qual será o formato, layout, estilo e por aí vai.

De qualquer forma, a estrutura de posts será mantida, então, esse post deve ser atualizado de vez em quando com alguns complementos e melhorias.

Agora vamos ao que interessa.

--------

## **1. Softwares necessários**

> **DICA**
>
> Para usuários **Linux** e **Mac**: A maioria dos comandos abaixo (relacionados a instalação de softwares) só funcionam com o **sudo** na frente, ou seja, **sudo gem install bundler**.
>
> Nos demais casos (executando como root ou usuários Windows), isso não será necessário. ;-)


#### **Git**
#### **Ruby**
#### **bundler**

	gem install bundler

#### **Jekyll**

	gem install jekyll

#### **jekyll-sitemap**

	gem install jekyll-sitemap

#### **jekyll-feed**

	gem install jekyll-feed

## **2. Iniciando seu site**

Após instalar tudo, vamos criar o site.

Primeiro, execute o comando abaixo:

	jekyll new nome_site

Ou dentro da pasta onde quer guardar as coisas:

	jekyll new .

Isso vai criar uma estrutura de pastas e arquivos necessários para a coisa funcionar.

Caso não esteja na pasta, entre nela com o seguinte comando:

	cd nome_site

Agora para testar, execute:

	jekyll server

Isso vai subir um servidor local que você pode testar acessando:

	http://localhost:4000

Quando você acessar esse endereço vai ver o site de exemplo que o jekyll cria. Agora, edite isso e monte seu site. ;-)

Durante o desenvolvimento do seu site, recomendo a abertura de uma nova janela de terminal com o comando:

	jekyll build --watch

Dessa forma, sempre que atualizar alguma coisa, isso será refletido *automágicamente* no endereço local de testes. :-)

## **3. Entendendo a estrutura do site criado**

O comando acima vai criar um arquivo **_config.yml**, nele você pode simplesmente trocar os dados para os seus e de quebra criar algumas variáveis novas que podem ser utilizadas em seu site.

Outros pontos que acho bem bacana de criar:

#### **_layouts**

É bem útil ter um local com todos os possíveis layouts que você pretende ter em seu site, por exemplo, uma página simples, uma postagem e coisas do tipo.

#### **_includes**

Os includes são blocos de página utilizados para compor seu layout, por exemplo, um cabeçalho, rodapé, fragmento para inclusão de google analytics e aí por diante.

#### **Arquivos .md**

O Jekyll usa arquivo markdown para oferecer páginas com formatação simples e sem a necessidade de conhecimento técnico para criá-las.

Para montar esses arquivos **.md** você pode fazer tudo na unha e ver como está ficando realizando testes no navegador mesmo ou pode utilizar um editor online (por exemplo).

Quando estou trabalhando em um mac costumo utilizar o MacDown para escrever arquivos MD e quando estou em uma máquina linux ou windows costumo utilizar o [Stack Edit](https://stackedit.io/editor). Bem útil mesmo. ;-)
...

--------

Bom gente, é domingo e estou escrevendo isso aos poucos. hehehe. Então vou voltar para o netflix e durante a semana escrevo mais... :-)
