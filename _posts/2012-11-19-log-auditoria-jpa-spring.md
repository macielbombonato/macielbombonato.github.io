---
layout: post
title: Log de Auditoria - JPA + Spring
author: Maciel Escudero Bombonato
---

Mais um dos antigos migrados para cá.

# Log de Auditoria - JPA + Spring

--------

Vira e volta, aparecem sistemas onde é necessário fazer um esquema de log de auditoria para uma tabela ou várias.

Montei um esquema que pode ser facilmente extendido para outras tabelas do sistema, para fazê-lo, basta seguir os passos abaixo:

### 1. Criar um enum para representar as ações de banco:

	public enum TransactionType {
	    CREATE, UPDATE, DELETE;
	}


### 2. Criar a entidade de log de auditoria:

	@Entity
	@Table(name = "log_trace")
	@AttributeOverride(name = "id", column = @Column(name = "log_trace_id"))
	public class LogTrace extends BaseEntity {
	
	    @Column(name = "transaction_type", nullable = false)
	    @Enumerated(EnumType.STRING)
	    private TransactionType transactionType;
	
	    @Column(name = "entity_name", nullable = false)
	    private String entityName;
	
	    @Column(name = "registry_id", nullable = false)
	    private Long registryId;
	
	    @Column(name = "operation_date", nullable = false)
	    @Temporal(TemporalType.TIMESTAMP)
	    private Date operationDate;
	
	    @ManyToOne(fetch = FetchType.LAZY)
	    @JoinColumn(name = "executed_by", nullable = false)
	    private User executedBy;
	
	...getters e setters...
	}


### 3. Criar o repositório (DAO) e o serviço como está sendo feito no restante do sistema;

### 4. Criar o listener que será disparado pelo hibernate:

	public class LogTraceListener {
	
	    @Autowired
	    LogTraceService logTraceService;
	
	    @Autowired
	    UserService userService;
	
	    @PostRemove
	    void postDelete(BaseEntity e) {
	        createLog(TransactionType.DELETE, e);
	    }
	
	    @PostPersist
	    void postPersist(BaseEntity e) {
	        createLog(TransactionType.CREATE, e);
	    }
	
	    @PostUpdate
	    void postUpdate(BaseEntity e) {
	        createLog(TransactionType.UPDATE, e);
	    }
	
	    private void createLog(TransactionType transactionType, BaseEntity e) {
	        /*
	         * OBSERVAÇÃO 1.
	         */
	        if (logTraceService == null) {
	            ApplicationContext ctx = ContextLoader.getCurrentWebApplicationContext();
	
	            logTraceService = (LogTraceService) ctx.getBean("logTraceService");
	        }
	
	        /*
	         * OBSERVAÇÃO 2.
	         */
	        User user = userService.getAuthenticatedUser();
	
	        LogTrace logTrace = new LogTrace();
	        /*
	         * OBSERVAÇÃO 3.
	         */
	        String entityName = e.getClass().getAnnotation(Table.class).name();
	        if (entityName == null || entityName.isEmpty()) {
	            entityName = e.getClass().getSimpleName();
	        }
	
	        logTrace.setTransactionType(transactionType);
	        logTrace.setEntityName(entityName);
	        logTrace.setRegistryId(e.getId());
	        logTrace.setExecutedBy(user);
	        logTrace.setOperationDate(new Date());
	
	        logTraceService.save(logTrace);
	    }
	}


## Observações:

1. O listener é disparado pelo mecanismo JPA. Uma vez que a classe não foi instanciada pelo Spring, as dependências não são injetadas e para resolver isso, podemos usar aspéctos (AOP) ou uma abordagem mais simples como a feita acima;
2. A lógica de recuperação do usuário logado (via consulta ou busca na sessão) está no serviço neste caso;
3. Alguns projetos adotam o uso da anotação **@Table**, neste listener, coloquei uma lógica que abrange esta abordagem (como principal) e se não for o caso, o campo receberá o nome da entidade, por exemplo, "PedidoInterno", ao invés de "pedido_interno" (que é a forma como os bancos normalmente são modelados. Veja que nossa "LogTrace" teria o campo salvo como "log_trace";
4. Anotar entidades que devem ser auditadas:
As entidades que devem ser auditadas recebem a anotação **@EntityListeners(value = LogTraceListener.class)**. Para melhorar a leitura da classe, indico colocar esta anotação logo após a anotação **@Entity** ou **@Table(name = "minha_entidade")**.

Com isso, sempre que uma das operações monitoradas pelo listener acontecer, são as anotações que estão sobre os métodos: **@PostPersist**, **@PostUpdate** e **@PostRemove**, um registro será gerado na tabela de log de auditoria.

Para que outra tabela/entidade seja autitada, basta repetir o passo 5 (incluir a anotação na entidade).

> NOTA: Normalmente as entidades de um sistema extendem uma entidade base ou implementam uma interface para que um padrão "mínimo" seja seguido. Este exemplo foi construído considerando este caso, ou seja, as entidades extendem BaseEntity.