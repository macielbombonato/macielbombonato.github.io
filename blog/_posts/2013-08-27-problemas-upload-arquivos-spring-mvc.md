---
layout: post
title: Problemas com upload de arquivos utilizando spring MVC
author: Maciel Escudero Bombonato
---

Mais um dos antigos migrados para cá.

--------

Só uma dica rápida para aquele caso que está tudo certo e quando o Spring valida o conteúdo do campo de arquivos e vc recebe a seguinte mensagem:

	Failed to convert property value of type 'java.lang.String' to required type 'org.springframework.web.multipart.MultipartFile' for property 'XXX'

Confirme se o formulário está com a propriedade enctype...

	<form action="URL/" enctype="multipart/form-data" id="form" method="post">

Este pequeno detalhe causou o erro acima. ;-)
