---
layout: post
title: JSF 2.0 + Spring - Injeção de Dependência (DI)
author: Maciel Escudero Bombonato
---

Mais um dos antigos migrados para cá.

# JSF 2.0 + Spring - Injeção de Dependência (DI)

--------

Estou desenvolvendo uma aplicação utilizando JSF 2.0, Hibernate, Spring 3, etc...

No caso, procurei utilizar anotações e acabei cometendo um equívoco na escolha das anotações que a principio, não gerou problema, porém, quando testei multiplos acessos à aplicação, os problemas começaram a aparecer, como por exemplo, um usuário invalidando a sessão do outro.

O ponto é que eu estava usando a anotação **@Component("nomeBean")** nos beans gerenciados e **@Autowired** para fazer o trabalho de DI (anotações do Spring).

Pesquisando para resolver o problema, cheguei ao seguinte resultado:

Ao invés de:

	@Component("nomeBean")


Use:

	@ManagedBean(name="nomeBean")

e ao invés de:

	@Autowired

Use:

	@ManagedProperty(value="#{nomeBeanInjetar}")


Utilizarei como exemplo uma classe usuário recebendo a injeção de um UsuarioDAO. 

Implentação do UsuarioDAO que deverá ser injetado no objeto usuarioController, que é meu managed bean:

	@Component("usuarioDAO")
	public class UsuarioDAO implements IUsuarioDAO {
	...

Classe que receberá a injeção:

	@ManagedBean(name="usuarioController")
	@SessionScoped
	public class UsuarioController {

		@ManagedProperty(value="#{usuarioDAO}")
		private IUsuarioDAO usuarioDao;

		public void setUsuarioDAO(IUsuarioDAO usuarioDAO) {
			this.usuarioDAO = usuarioDAO;
		}
	...


Note que na abordagem acima estou usando anotações do JSF (@ManagedBean e @ManagedProperty) e anotações do Spring.

A ideia é a seguinte:

- Criamos os objetos que serão reutilizados mais adiante sendo injetados em nossos managed beans, esses objetos devem ser marcados como componentes e nesse momento, devemos dar um nome a ele, nesse processo, o Spring vai criar este objeto em memória e deixá-lo pronto para ser injetado quando for chamado;
- O segundo passo é no nosso managed bean que devemos identificar a propriedade com a anotação @ManagedProperty e informar qual será o objeto que deverá ser injetado usando o mesmo nome dado anteriormente;

Bom, seguindo o padrão de posts rápidos e dirétos, basicamente foi isso que me ajudou bastante.

OBS.:

1. Quando utilizada a anotação @ManagedProperty, o atributo deve possuir um setter associado a ele, como no exemplo acima;
2. Quando ainda não tinha notado que o erro era este, procurei coisas estáticas na aplicação e por ai vai, então, fica a dica;

Espero ter ajudado e até a próxima.