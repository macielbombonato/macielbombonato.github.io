---
layout: post
title: Atualizando a passphrase da sua chave privada SSH
author: Maciel Escudero Bombonato
---

Esse post descreve como atualizar a senha da sua chave SSH.

---

Imagine que fosse necessário gerar uma chave SSH nova e alterá-la em todas as máquinas que você acessa só por causa da senha que precisa ser alterada por algum motivo. 

Bom, não precisa. Dá pra fazer isso com o comando abaixo:

	ssh-keygen -p -f ~/.ssh/id_rsa
	
Caso receba uma mensagem de que o arquivo não existe, entre nesse diretório e confirme o nome do arquivo **id_xxx**.

Bom, o comando funcionando, você precisará entrar com a senha antiga e depois a senha nova duas vezes.

> Caso não queira mais digitar senha, basta deixar em branco e digitar **ENTER** nas duas vezes que ele pedir a senha. ;-)