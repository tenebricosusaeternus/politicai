# V-Tracker Query Strategy

Objetivo: reduzir ruido antes do banco e da LLM. Nao use `Belem` sozinho como gatilho.
Use busca em camadas: identidade do prefeito, Prefeitura, secretarias/orgaos, programas,
servicos municipais, riscos institucionais e geografia local combinada com servico publico.

## Alta Precisao

```text
(
  "Igor Normando" OR
  "Igor Wander Centeno Normando" OR
  "prefeito Igor" OR
  "prefeito de Belém" OR
  "Prefeitura de Belém" OR
  "Prefeitura Municipal de Belém" OR
  "PMB Belém" OR
  "Palácio Antônio Lemos" OR
  "Cássio Andrade" OR
  "Gabinete do Prefeito" OR
  "Agência Belém"
)
AND
(
  "Belém-PA" OR "Belém PA" OR "Belém do Pará" OR "capital paraense" OR Belem
)
NOT
(
  "Belém-PB" OR "Belém PB" OR "Belém/AL" OR "Belém AL" OR
  "Belém de Maria" OR "Belém do Brejo do Cruz" OR "Belém de São Francisco" OR
  "bairro do Belém" OR "estação Belém" OR "metrô Belém" OR "São Paulo Belém" OR
  "Fafá de Belém" OR Bethlehem
)
```

## Secretarias e Orgaos

```text
(
  SESMA OR SEMEC OR SEFIN OR SEZEL OR SEINFRA OR SEGBEL OR SEGEP OR SEGOV OR
  SEMCAD OR SEMMA OR SETUR OR SECULT OR SEMTE OR SEMU OR SEMEL OR PGM OR CGM OR
  CODEM OR FUNPAPA OR BELEMPREV OR ARBEL OR "Belém Digital" OR PROMABEN OR
  GMB OR IASB OR OGM OR SEOPDEC OR SEPDA OR "Subprefeitura de Icoaraci" OR
  "Subprefeitura de Mosqueiro" OR "Subprefeitura de Outeiro"
)
AND
(
  Belém OR Belem OR "Prefeitura de Belém" OR "Belém-PA"
)
NOT
(
  "Belém-PB" OR "Belém PB" OR "Belém/AL" OR "bairro do Belém" OR "Fafá de Belém"
)
```

## Crise e Risco

```text
(
  "Igor Normando" OR "Prefeitura de Belém" OR SESMA OR SEMEC OR SEZEL OR SEINFRA OR SEGBEL
)
AND
(
  denúncia OR investigação OR irregularidade OR "ação civil pública" OR MPPA OR "TCM-PA" OR
  "Tribunal de Contas" OR auditoria OR fiscalização OR licitação OR contrato OR
  "dispensa de licitação" OR "termo aditivo" OR greve OR paralisação OR
  "falta de pagamento" OR "falta de medicamento" OR alagamento OR lixo OR buraco
)
```

## Entregas e Programas

```text
(
  "Belém Limpa" OR COP30 OR "COP 30" OR "Mata Fome" OR "Macrodrenagem do Mata Fome" OR
  "600 ruas" OR asfaltamento OR pavimentação OR "Praça da Cidadania" OR "RAG 2025" OR
  "Relatório Anual de Gestão" OR "reforma administrativa" OR "100 dias"
)
AND
(
  "Igor Normando" OR "Prefeitura de Belém" OR "Belém-PA" OR Belem
)
```

## Diario Oficial e Atos

```text
(
  "Igor Normando" OR "Prefeitura de Belém" OR "PMB" OR SESMA OR SEMEC OR SEFIN OR SEINFRA OR SEZEL
)
AND
(
  "Diário Oficial" OR decreto OR portaria OR lei OR "lei municipal" OR nomeação OR exoneração OR
  designação OR contrato OR edital OR licitação OR pregão OR convênio OR "termo aditivo"
)
```

## Sinal Fraco de Morador

Use somente quando houver bairro/distrito + servico municipal.

```text
(
  Guamá OR Jurunas OR "Terra Firme" OR Benguí OR Icoaraci OR Mosqueiro OR Outeiro OR
  Tapanã OR Pedreira OR Sacramenta OR Marco OR Marambaia OR "Cidade Velha" OR
  "Parque Verde" OR Coqueiro OR Cabanagem OR Telégrafo OR Condor
)
AND
(
  alagamento OR lixo OR entulho OR buraco OR asfalto OR "boca de lobo" OR iluminação OR
  ônibus OR tarifa OR trânsito OR UPA OR UBS OR "posto de saúde" OR medicamento OR
  creche OR "escola municipal" OR merenda
)
AND
(
  Belém OR Belem OR "Belém-PA" OR "capital paraense"
)
```

## Rebaixar ou Ignorar

```text
"Belém-PB" OR "Belém PB" OR "Prefeitura Municipal de Belém - PB" OR
"Belém/AL" OR "Belém AL" OR "Belém de Maria" OR
"Belém do Brejo do Cruz" OR "Belém de São Francisco" OR
"Belém Palestina" OR "Belém Portugal" OR "bairro do Belém" OR
"Estação Belém" OR "metrô Belém" OR "São Paulo Belém" OR
"Conquista Normanda" OR "povo normando" OR "arquitetura normanda" OR
"Fafá de Belém" OR "Igor" sem "Normando" OR "Belém" sozinho
```

Regra operacional: nao descarte reclamacao de morador quando houver bairro + servico publico,
mesmo sem citar Igor ou Prefeitura. Ela entra como sinal fraco e ganha prioridade se repetir.
