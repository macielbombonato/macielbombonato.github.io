# marketing-cloud/ — definições declarativas versionadas

Esta pasta é a **fonte da verdade versionada** das estruturas do Marketing Cloud
Engagement (MCE) usadas pelo site `bombonato.net`. Os arquivos JSON aqui são
**lidos e aplicados** pelo servidor MCP `mc-mcp-server` (projeto separado, em
`~/mc-mcp-server`), que se conecta ao ambiente escolhido usando credenciais que
ficam **fora** de qualquer repositório (no `~/.cursor/mcp.json`).

> As **credenciais e ambientes** nunca ficam aqui. Aqui ficam apenas as
> definições de **o que** criar/atualizar no MCE — para que você tenha controle
> de versão e histórico de alteração desses itens.

## Estrutura

```
marketing-cloud/
├── data-extensions/        # estruturas de Data Extension (criadas via SOAP)
│   └── Site_Behavior_Segments.json
└── journeys/               # definições de Journey Builder (Interaction REST)
    └── site-behavior-welcome.json
```

## Data Extensions

Schema de cada arquivo (validado pelo `mc-mcp-server`):

| Campo | Obrigatório | Descrição |
|---|---|---|
| `kind` | não | `"dataExtension"` (ajuda o `apply_all` a rotear) |
| `name` | sim | Nome da DE |
| `key` | não | External Key / CustomerKey (default = `name`) |
| `description` | não | Descrição |
| `folderId` | não | Id da pasta/categoria onde criar |
| `isSendable` | não | `true` para DE sendable |
| `sendableSubscriberField` | quando sendable | Campo da DE usado na relação de envio |
| `sendableSubscriberKey` | não | Atributo do assinante (default `"Subscriber Key"`) |
| `fields[]` | sim | Lista de campos |

Campo (`fields[]`): `name`, `type` (`Text`, `Number`, `Date`, `Boolean`,
`EmailAddress`, `Phone`, `Decimal`, `Locale`), `length` (Text/Email/Phone),
`scale` (Decimal), `isPrimaryKey`, `isNullable`, `defaultValue`.

A DE `Site_Behavior_Segments` é o destino para membros dos segmentos do
Personalization (interesse **carreira** vs **blog**) e alimenta Journeys por meio
de uma ponte de sincronização externa (não versionada neste repositório).

## Journeys

A definição é repassada quase integralmente ao endpoint
`/interaction/v1/interactions` do Journey Builder (o `mc-mcp-server` valida só o
envelope: `key`, `name` e os blocos `triggers`/`activities`/`goals`/`defaults`).
O arquivo `site-behavior-welcome.json` é um **esqueleto** — o caminho recomendado
é construir a jornada na UI, exportá-la e versionar o JSON aqui, substituindo os
placeholders (`PREENCHER_COM_...`).

## Gap atual do fluxo ponta a ponta

No estado atual deste repositório:

- existe definição de **estrutura** (DE e Journey), mas não existe código/job para
  ler membros de segmentos no MCP e gravar na DE automaticamente;
- a Journey versionada `site-behavior-welcome.json` usa trigger `APIEvent`
  (não Data Extension Entry Source), então depende de um produtor externo
  chamando o endpoint de eventos da Journey;
- `apply_journey` cria/atualiza definição, mas não publica automaticamente a
  Journey (a publicação continua na UI do Journey Builder).

## Como aplicar

No Cursor, com o `mc-mcp-server` configurado (veja o README do projeto), chame os
tools apontando para os caminhos **deste repo**, por exemplo:

- `create_data_extension` → `environment: "prod"`, `definitionPath: ".../marketing-cloud/data-extensions/Site_Behavior_Segments.json"`
- `apply_journey` → `environment: "prod"`, `definitionPath: ".../marketing-cloud/journeys/site-behavior-welcome.json"`
- `apply_all` → `environment: "prod"`, `dir: ".../marketing-cloud"` (aplica DEs antes das journeys)

## O que NÃO é automatizável (Personalization)

Segmentos, campanhas, recipes e templates do Marketing Cloud Personalization
**não têm API pública de criação** — continuam sendo feitos na UI. O que o
`mc-mcp-server` automatiza do lado Personalization é apenas a **ingestão de
catálogo** (upload dos CSVs `catalog-object-*.csv` via SFTP).
