---
name: serve-local
description: Sobe o Fluxo (index.html) em localhost para ver uma mudança funcionando no navegador, com o Firebase de produção ou com os emuladores locais (Auth + Firestore). Use quando o usuário pedir para rodar, abrir, testar no navegador ou conferir visualmente uma mudança no app.
argument-hint: "[emulator]"
---

Suba o app localmente. Argumento recebido: `$ARGUMENTS` (`emulator` = usar os emuladores).

## Por que localhost

O Firebase Auth só aceita origens autorizadas: `localhost` vem autorizado por
padrão; `file://` e `127.0.0.1` não. Sirva sempre por HTTP e abra por
`http://localhost:<porta>`.

## Passos

1. Confira se a porta 5500 está livre: `ss -ltn | grep -q ':5500 ' && echo ocupada || echo livre`.
   Se estiver ocupada por um servidor anterior desta sessão, reaproveite.
2. Suba o servidor em background, preso ao loopback (nunca `0.0.0.0`, para não
   expor o app na rede local):
   ```bash
   npm run serve   # python3 -m http.server 5500 --bind 127.0.0.1 --directory public
   ```
3. **Sem `emulator`**: o app fala com o Firestore de **produção**. Avise o
   usuário de que qualquer coisa criada ou apagada ali vale para o time inteiro.
   URL: `http://localhost:5500/`
4. **Com `emulator`** (só depois da Onda 0, quando existir `firebase.json`):
   - Em outro processo em background: `npx firebase emulators:start --only auth,firestore`
     (Auth em 9099, Firestore em 8080, UI em 4000).
   - URL: `http://localhost:5500/?emulator=1` (o app só liga os emuladores em
     `localhost` com esse parâmetro — RF-13 da spec).
   - Usuários e perfis de teste: crie pela UI do emulador (`http://localhost:4000`)
     ou pelo seed dos testes.
5. Entregue ao usuário a URL e diga o que conferir. Se houver ferramenta de
   navegador disponível, abra a URL e confira você mesmo antes de dizer que funciona.
6. Ao terminar, encerre os processos que você subiu.

## Cuidados

- Não use dados reais de clientes nos emuladores.
- Se o console do navegador mostrar `permission-denied`, a sessão ou o perfil
  não estão válidos para as regras: confira `fluxo_users/{uid}` e `active`.
