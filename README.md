# steam-command

Comandos de chat para **StreamElements** que muestran estadísticas de mi cuenta de **Steam** durante el stream. Cada comando llama a una Netlify Function que consulta la [Steam Web API](https://developer.valvesoftware.com/wiki/Steam_Web_API) y responde en **texto plano**. StreamElements pega esa respuesta directo en el chat.

```
!steam
🎮 GabyRanma: 70 juegos | ⏱️ 344 h jugadas | 🏆 3 al 100% | Más jugado: Cookie Clicker (106 h) | Reciente: Vampire Survivors | https://steamcommunity.com/profiles/76561199559723347/
```

## Cómo funciona

```
Chat de Twitch ──!steam──► StreamElements ──${customapi}──► Netlify Function ──► Steam Web API
                                                                  │
                                                                  ▼
                                                           Netlify Blobs (caché)
                                                                  ▲
                              Scheduled Function (cada 30 min) ───┘
                              recalcula los juegos al 100 %
```

Para saber si un juego está al 100 % hay que llamar a `GetPlayerAchievements` una vez por cada juego. Eso tarda demasiado para responder a tiempo en el chat. Por eso una **Scheduled Function** hace el cálculo en segundo plano y lo guarda en **Netlify Blobs**. El comando solo lee ese caché y responde en menos de 1 s.

El cálculo es **incremental**: solo vuelve a consultar los juegos jugados desde la última ejecución, usando `rtime_last_played`. Además tiene un límite de ~20 s por ejecución; si no alcanza a terminar, la siguiente sigue donde quedó.

## Stack

| Capa | Tecnología |
|---|---|
| Lenguaje | TypeScript (ESM, `strict`) |
| Runtime | Node.js, en Netlify Functions con la sintaxis moderna (`export default` + `Response`) |
| Hosting | Netlify (plan Free) |
| Caché | Netlify Blobs |
| Integración de chat | StreamElements, comandos custom con `${customapi}` |
| Fuente de datos | Steam Web API |

### Librerías

| Paquete | Tipo | Uso |
|---|---|---|
| `@netlify/functions` | dependencia | Tipos `Config` y el global `Netlify.env` |
| `@netlify/blobs` | dependencia | Guardar en caché la biblioteca y el progreso de logros |
| `typescript` | dev | Revisión de tipos (`tsc --noEmit`); Netlify compila con esbuild |
| `@types/node` | dev | Tipos de Node |

## Endpoints / Functions

| Function | Ruta / Trigger | Respuesta | Descripción |
|---|---|---|---|
| `profileDataCommand` | `GET /api/profile-data` | `text/plain` | Comando `!steam`: juegos, horas, juegos al 100 %, más jugado, reciente (el de `rtime_last_played` más nuevo, igual que `!progress`) o jugando ahora, y link al perfil. Siempre responde status 200 con un mensaje apto para el chat, incluso si hay error. |
| `updateCompletionStats` | Programada, `*/30 * * * *` | — | Recalcula de forma incremental el progreso de logros por juego y lo guarda en Blobs. |
| `gameProgressCommand` | `GET /api/game-progress?q=` | `text/plain` | Comando `!progress {juego}`: logros obtenidos de un juego, buscado por appid o por nombre (con similitud y "¿Quisiste decir…?"). Sin argumento usa el juego en partida o el último jugado. Siempre responde status 200. |

### Estructura

```
netlify/
  functions/         Endpoints y funciones programadas
  services/
    steamApi.ts        Cliente tipado de la Steam Web API (timeout de 4 s y errores tipados)
    gameLibrary.ts     Biblioteca de juegos con caché de 15 min en Blobs
    completionStore.ts Lectura y escritura del progreso de logros en Blobs
    cacheStore.ts      Store de Blobs "steam-cache"
    chatResponse.ts    Respuesta en texto plano y mensajes de error aptos para el chat
    gameMatcher.ts     Búsqueda de juegos por nombre (normalización + coeficiente de Dice)
  types/steam.ts     Tipos de las respuestas de Steam
```

## Configuración

### Variables de entorno

| Variable | Descripción |
|---|---|
| `STEAM_API_KEY` | API key de Steam ([obtenerla aquí](https://steamcommunity.com/dev/apikey)) |
| `STEAM_PROFILE_ID` | SteamID64 de la cuenta (17 dígitos) |

En local van en `.env`, que no se sube al repo. En producción se configuran en **Site settings → Environment variables** de Netlify.

> El perfil de Steam y los **Detalles del juego** deben estar en **Público**. Si no, la API no devuelve horas ni logros.

### Desarrollo local

```bash
npm install
npm run dev                                        # netlify dev en http://localhost:8888
netlify functions:invoke updateCompletionStats     # ejecuta a mano la función programada
curl http://localhost:8888/api/profile-data
curl "http://localhost:8888/api/game-progress?q=baldurs%20gate%203"
npm run typecheck                                  # revisión de tipos
```

En local, las funciones programadas no corren solas: hay que invocarlas a mano. En producción solo corren en deploys publicados.

### Comando en StreamElements

Crear un comando custom `!steam` con esta respuesta:

```
${customapi.https://TU-SITIO.netlify.app/api/profile-data}
```

Y un comando `!progress`:

```
${customapi.https://TU-SITIO.netlify.app/api/game-progress?q=${queryescape ${1:}}}
```

`${1:}` toma todo el texto después del comando y `queryescape` protege espacios y apóstrofos.

Recomendado: poner cooldown (por ejemplo, 30 s global y 60 s por usuario).

## Consumo en el plan Free

Límites del plan Free: 125k invocaciones al mes y 100 h de ejecución.

- `updateCompletionStats`: 48 invocaciones al día, ~1.488 al mes, menos de 0,5 h de ejecución.
- `!steam`: ~0,5 s por llamada. Quedan ~123.500 invocaciones al mes, unas 3.980 al día, **menos lo que usen otras functions del mismo sitio**.
- El límite que se alcanza primero es el de invocaciones, no el de horas.

## Roadmap

### ✅ Hecho
- [x] Migración de `.mjs` a TypeScript y a la sintaxis moderna de Netlify Functions
- [x] API key y SteamID en variables de entorno
- [x] `!steam`: juegos, horas totales, juegos al 100 %, más jugado, reciente o jugando ahora, y link al perfil
- [x] Cálculo incremental de juegos al 100 % con Scheduled Function y Netlify Blobs
- [x] Caché de la biblioteca y mensajes de error aptos para el chat
- [x] `!progress {juego}`: progreso de logros de un juego (`Baldur's Gate 3: 38/54 logros (70%)`)
  - [x] Búsqueda por appid y por nombre, con normalización y similitud (Dice)
  - [x] "¿Quisiste decir…?" cuando hay varios candidatos
  - [x] Sin argumento: el juego actual o el último jugado
  - [x] Detectar juegos sin logros

### 🚧 Pendiente de `!progress`
- [ ] Recortar la respuesta a menos de 400 caracteres
- [ ] Alias manuales (`re4`, `bg3`)

### 💡 Backlog
- [ ] Top 5 juegos por horas jugadas
- [ ] `!completados`: lista de los juegos al 100 %
- [ ] Logro más raro o último logro desbloqueado
- [ ] Histórico de progreso (juegos completados esta semana o este mes)
- [ ] Aviso automático en el stream al completar un juego al 100 %
- [ ] Consultar el perfil de un viewer (`!steam nombre`, resuelto con `ResolveVanityURL`)
- [ ] Tests unitarios (Vitest)
