---
layout: post
title: JSF - URL não muda após redirect?
author: Maciel Escudero Bombonato
---

Mais um dos antigos migrados para cá.

# JSF - URL não muda após redirect?

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
