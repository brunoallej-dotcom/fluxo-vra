# Spec — Identidade visual VRA (cores e logo)

- **Status**: em implementação (branch `feat/brand-colors-logo`)
- **Data**: 2026-11-18
- **Pedido do usuário**: trocar a paleta preto/cobre/branco pela nova e usar
  a logo nova ("Identidade premium do monograma VRA"), com autonomia para
  decidir onde cada cor entra.

## 1. Visão geral

Hoje o Fluxo usa barra lateral preta (`#101010`), destaque cobre (`#E8662E`) e
fundos brancos/bege. A marca nova tem três cores e um monograma "VRA" com
serifa:

| Cor | Hex | Papel no app |
|---|---|---|
| Branco creme | `#FAFAF4` | Superfície dos cartões e painéis; texto sobre o verde |
| Laranja | `#D9540D` | Destaque (`--accent`): botões principais, item ativo, hoje no calendário, gráficos, avatar |
| Verde | `#29710E` | Barra lateral; cor de "concluído/em dia" (`--calm`) |

**Fora do escopo:** mudar layout, espaçamentos, fontes ou textos; cores de
pessoas que não são da marca (Júlia, Vinicius, paleta de avatares de
clientes); cores de prioridade (urgente/médio); cores gravadas em
`fluxo_users.color` no banco; o relatório em PDF além da cor de destaque.

## 2. Requisitos

| ID | Requisito |
|---|---|
| RV-01 | Tema claro: fundo da página creme mais escuro (`#F1F1E7`), cartões em creme `#FAFAF4`, textos e bordas em neutros puxados para o verde. Nada de branco puro em superfícies grandes. |
| RV-02 | Destaque laranja `#D9540D` em todo lugar onde hoje há cobre (CSS, gráficos do Chart.js, legenda da rotina, categoria "Tráfego Pago", relatório). Hover do botão principal: `#B9470A`. |
| RV-03 | Barra lateral verde `#29710E` com texto creme; item ativo em pílula creme com texto verde, ícone laranja e filete laranja à esquerda; menu do usuário em verde mais escuro. |
| RV-04 | Verde da marca como `--calm` (concluído, em dia, sincronizado), com fundo suave por token (`--calm-soft`) que funciona nos dois temas. |
| RV-05 | Tema escuro: neutros quase pretos puxados para o verde (`#0D130B` …), texto creme, barra lateral em verde profundo (`#1A4A09`), verde de status mais claro (`#5FAE3E`) para manter contraste. |
| RV-06 | Logo: monograma novo, com fundo transparente, em duas versões — laranja (fundos claros) e creme (barra verde e tema escuro) — embutido em base64 nas variáveis `--logo-dark` e `--logo-white`, sem arquivo extra. Proporção 617 × 389. |
| RV-07 | Contraste (WCAG): texto comum ≥ 4,5:1 sobre o fundo onde aparece, nos dois temas; texto da barra lateral ≥ 4,5:1 sobre o verde (rótulos pequenos em caixa alta ≥ 3:1). Exceção conhecida: texto branco sobre o laranja da marca dá ~4,0:1 (antes, sobre o cobre, dava ~3,3:1) — aceita por ser a cor pedida, usada em botões e selos em negrito. |
| RV-08 | Nenhuma mudança de comportamento: mesmos seletores `data-testid`, E2E E01–E09 verdes, `npm run check` verde. |

## 3. Critérios de aceite

- `npm run check` e `git diff --check` verdes; E2E E01–E09 verdes nos emuladores.
- Nenhuma ocorrência restante de `#E8662E`, `rgba(232,102,46,…)`, `#101010`
  nem dos tokens `--vra-copper*`/`--vra-ivory`/`--vra-black` no `index.html`.
- Prints conferidos (claro e escuro; computador e celular) da tela de login,
  Dashboard, Tarefas, Agenda, Kanban, Health Score e Relatórios.
- Revisão independente do diff sem achados bloqueantes.
