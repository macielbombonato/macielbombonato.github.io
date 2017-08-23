---
layout: post
title: Copiar chave pública SSH sem precisar do tradicional copy/paste
author: Maciel Escudero Bombonato
---

Mais um migrado para cá.

# Copiar chave pública SSH sem precisar do tradicional copy/paste

--------

Bom, este micro artigo é mais um da série "vou precisar disso denovo, mas vou esquecer".

Depois que geramos uma chave SSH em uma máquina unix:

	ssh-keygen -t rsa

Vamos precisar copiar a chave pública para inserí-la em alguns lugares.

Bom, existe um comandinho mágico no OS X que faz com que não precisemos selecionar, e usar o Ctrl+C (Cmd+C no OS X) para pegar o conteúdo da chave, para isso basta usar o seguinte comando:

	cat ~/.ssh/id_rsa.pub | pbcopy

O pbcopy faz todo o trabalho sujo de copiar o conteúdo que devemos colocar no github (por exemplo).

Beleza, bora fazer isso no Linux então. SQN.

Para que isso funcione no linux (sim, existe similar), é necessário:

### 1. Instalar o xclip (ele faz um trabalho similar):

	sudo apt-get install xclip

### 2. Agora (eu recomendo) é só criar um alias no seu arquivo de profile (.profile ou .bashrc dentro da pasta home do seu usuário), para isso, adicione a seguinte linha em um desses arquivos:

	alias pbcopy="xclip -selection clipboard"

Depois, no terminal execute o seguinte comando (supondo que isso foi inserido no .bashrc):

	source ~/.bashrc

Agora é só ficar feliz e utilizar no seu linux o mesmo comando feito no OS X.

OBS.: Depois de executar o comando é só ir até o local necessário e colar o conteúdo.