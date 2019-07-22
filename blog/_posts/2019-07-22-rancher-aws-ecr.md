---
layout: post
title: Rancher - Registro privado AWS ECR
author: Maciel Escudero Bombonato
---

Esse post descreve como atualizar a o token de autenticação do registro de imagens da AWS, o ECR.

---

Bom gente, estou estudando um pouco do [Rancher](https://rancher.com/) e me deparei com um problema com o uso do registro de imagens privado da AWS o ECR. 

O token de acesso dele vale apenas por um tempo (acredito que seja algo em torno de 6 horas) e com isso, simplesmente cadastrar registros privados no banco de registros não resolve.

Pesquisando alternativas, achei [este artigo no medium](https://medium.com/@damitj07/how-to-configure-and-use-aws-ecr-with-kubernetes-rancher2-0-6144c626d42c) que me deu quase tudo que eu precisava, basicamente fiz alguns pequenos ajustes no script dele.

## Configurações

Primeiro, vá até o cluster que deseja incluir a credencial e clique na sequência de menus: **Resources > Secrets**

Clique em **Add Secret** (sugestão de nome aws) e adicione as seguintes chaves:

- AWS_ACCESS_KEY_ID
- AWS_ACCOUNT_NUMBER
- AWS_DEFAULT_REGION
- AWS_SECRET_ACCESS_KEY
- EMAIL

Caso em sua rede seja utilizado proxy, sugiro criar outra *Secret* com o nome de **proxy** e adicionar as seguintes chaves:

- http_proxy
- https_proxy

Caso tenha rotas pré-definidas que não devem sair por proxy, inclua a chave **no_proxy** aqui também.

> É interessante marcar essas chaves para uso em qualquer **namespace** para que os **Workloads** que vamos criar possam acessá-las.

## Deploy

Na parte superior esquerda temos o logo do rancher e ao lado uma estrutura de menu que permite navegar entre os clusters, navegue para o cluster e projeto que deseja incluir a chave.

Nesta tela teremos uma estrutura de tabs, certifique-se que estamos na tab **Workloads**.

Clique no botão **Import YAML** que fica na parte superior esquerda.

Na linha destacada cole o seguinte código:

```
apiVersion: batch/v1beta1
kind: CronJob
metadata:
  name: aws-ecr-credential
  namespace: default
spec:
  concurrencyPolicy: Allow
  failedJobsHistoryLimit: 1
  jobTemplate:
    metadata:
      creationTimestamp: null
    spec:
      template:
        metadata:
          creationTimestamp: null
        spec:
          containers:
          - command:
            - /bin/sh
            - -c
            - |-
              NAMESPACE=default
              SECRET_NAME=ecr-${NAMESPACE}
              AWS_ACCOUNT_NUMBER=${AWS_ACCOUNT_NUMBER}
              AWS_DEFAULT_REGION=${AWS_DEFAULT_REGION}
              EMAIL=${EMAIL}
              DOCKER_SERVER="https://${AWS_ACCOUNT_NUMBER}.dkr.ecr.${AWS_DEFAULT_REGION}.amazonaws.com"
              TOKEN=`aws ecr get-login --no-include-email --no-verify-ssl --region ${AWS_DEFAULT_REGION} --registry-ids ${AWS_ACCOUNT_NUMBER} | cut -d' ' -f6`  
              echo "ENV variables setup done." 
              echo " ==> Removendo registro" 
              kubectl delete secret --ignore-not-found ${SECRET_NAME} 
              echo " ==> Recriando registro" 
              kubectl create secret docker-registry ${SECRET_NAME} --docker-server=${DOCKER_SERVER} --docker-username="AWS" --docker-password="${TOKEN}" --docker-email="${EMAIL}"   
              echo " ==> Recuperando eventos do kubernetes" 
              kubectl get events 
              echo "Secret created by name. ${SECRET_NAME}" 
              echo " ==> Configurando que o registro padrao deve ser o ECR" 
              kubectl patch serviceaccount ${NAMESPACE} -p '{"imagePullSecrets":[{"name":"'${SECRET_NAME}'"}]}' 
              echo "All done." 
            env:
            - name: no_proxy
              value: 10.43.0.1
            envFrom:
            - secretRef:
                name: aws
                optional: false
            - secretRef:
                name: proxy
                optional: false
            image: odaniait/aws-kubectl:latest
            imagePullPolicy: IfNotPresent
            name: ecr-cred-helper
            resources: {}
            securityContext:
              allowPrivilegeEscalation: true
              capabilities: {}
              privileged: true
              procMount: Default
              runAsNonRoot: false
            terminationMessagePath: /dev/termination-log
            terminationMessagePolicy: File
          dnsPolicy: Default
          hostNetwork: true
          restartPolicy: Never
          schedulerName: default-scheduler
          securityContext: {}
          terminationGracePeriodSeconds: 30
  schedule: 0 */2 * * *
  successfulJobsHistoryLimit: 3
  suspend: false
status:
  lastScheduleTime: "2019-07-19T21:28:00Z"

```

### Pontos que devem ser analisados nesse código

No início do código temos a variável **namespace** que está como default, é necessário apontar para o namespace correto.

Esse ajuste de namespace deve ser refletido no meio do **yml** na variável **NAMESPACE**.

> Note que abaixo dessa variável as chaves que foram incluídas em secrets estão sendo atribuidas para variáveis internas deste serviço.

Um pouco abaixo temos referência as chaves secretas criadas, apontando para **aws** e **proxy**.

Por fim, temos a configuração **cron** deste serviço. Neste caso, configurado para executar todo zero minutos de duas em duas horas.

## O que isso faz?

Esse processo vai executar a cada duas horas, apagar a chave de registro privado que nesse caso se chamará **ecr-default** e recriá-la com o novo token.

Também dirá para sua estrutura kubernetes que toda imagem que for baixada dentro do workspace default deve utilizar este mesmo registro como padrão.

## Problemas que podem acontecer

Durante meus testes, me deparei com um problema de acesso a chave de registro privado, nas pesquisas que fiz, achei um caso parecido que pode ajudar nesse [post](https://stackoverflow.com/questions/49173838/deployments-apps-is-forbidden-user-systemserviceaccountdefaultdefault-cann).

Basicamente consiste em ir ao cluster (na tela do dashboard que mostra o estado do cluster) e clicar no botão **Launch Kubectl**.

No terminal digitar o seguinte código:

```
kubectl create clusterrolebinding serviceaccounts-cluster-admin \
  --clusterrole=cluster-admin \
  --group=system:serviceaccounts
```

> Não deixe de ver a dica dada no post mencionado acima.

## Conclusão

Após isso, as imagens que estavam no registro privado passaram a funcionar normalmente, agora preciso testar isso no **rancher 1.x** para ver que alterações que temos pra rodar este mesmo processo nele.