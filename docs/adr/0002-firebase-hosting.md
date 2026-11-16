# ADR-0002 — Firebase Hosting com publicação só de `public/`

- **Status**: accepted
- **Data**: 2026-11-16
- **Spec**: [docs/specs/hospedagem.md](../specs/hospedagem.md)

## Contexto

O Fluxo é servido em `crm.somosvra.com.br` pela Hostinger, que hoje não envia
os cabeçalhos de segurança exigidos pelo método AISAC (HSTS, CSP, `nosniff`,
`X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`). O projeto não
quer assumir planos pagos por enquanto. O login da Fase 1 exige que o domínio
esteja entre os "domínios autorizados" do Firebase Auth.

Opções avaliadas:

1. **Firebase Hosting (Spark, gratuito).** Mesmo projeto do Firestore e do Auth
   (domínio padrão já autorizado), cabeçalhos declarados no `firebase.json`
   (infraestrutura como código), SSL automático para domínio próprio, testável
   no emulador.
2. **Manter a Hostinger.** Cabeçalhos só por configuração manual do servidor
   (fora do repositório), sem teste automatizado.
3. **Cloudflare Pages / Netlify.** Também permitem cabeçalhos como código, mas
   acrescentam um terceiro fornecedor sem ganho para este caso.

## Decisão

Firebase Hosting no plano gratuito, publicando **só** o diretório `public/`
(o `index.html` foi movido para lá). Cabeçalhos no `firebase.json`, com a CSP
rígida em Report-Only até a refatoração dos handlers inline. Deploy a partir da
`main` com CI verde e confirmação humana.

Publicar a raiz do repositório com uma lista de exclusões foi descartado: um
arquivo novo seria publicado por padrão — inclusive `backups/`, que contém
dados de clientes.

## Consequências

**Positivas**
- Cabeçalhos de segurança versionados e testados (H01–H05).
- Deny by default no que é publicado.
- Um fornecedor a menos no caminho do login (Auth + Hosting no mesmo projeto).

**Negativas / riscos**
- Troca de DNS manual no painel da Hostinger (registros A **e AAAA**).
- CSP aplicada ainda fraca para scripts até a refatoração dos handlers inline.
- Caminho do arquivo mudou para `public/index.html`: comandos e docs atualizados
  no mesmo PR; frentes paralelas começam depois deste merge.
