---
layout: post
title: JSF - URL não muda após redirect?
author: Maciel Escudero Bombonato
description: Dica para forçar a mudança da URL no browser após redirect no JSF usando o parâmetro faces-redirect=true no retorno da action.
tags: [java, jsf, web, navigation, redirect]
topics: [development]
---

Mais um dos antigos migrados para cá.

--------

Em situações que um método retorna a url de redirect da sua página, como por exemplo:

	public String listar() {
		return "/pages/list.xhtml";
	}


E o JSF não muda a URL na barra do browser, recomendo a inclusão da seguinte string após a url:  + "?faces-redirect=true"

ficando:

	public String listar() {
		return "/pages/list.xhtml"  + "?faces-redirect=true";
	}

Fazendo isso, a URL sempre vai mudar. ;-)
