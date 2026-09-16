# POF: Planty of Food — GAS API

API JSON RESTful per gestire prodotti, utenti e ordini dei Gruppi di Acquisto Solidale.

## Requisiti

- Node.js 20+
- MySQL 8+

## Avvio

1. Copiare `.env.example` in `.env` e configurare le credenziali MySQL.
2. Eseguire `migrations.sql` sul server MySQL.
3. Installare le dipendenze con `npm install`.
4. Avviare con `npm start`.

L’endpoint `GET /health` verifica lo stato del servizio.

## Endpoint

| Metodo | Endpoint | Descrizione |
| --- | --- | --- |
| GET/POST | `/api/products` | Lista o crea prodotti |
| GET/PUT/PATCH/DELETE | `/api/products/:id` | Legge, sostituisce, aggiorna o elimina un prodotto |
| GET/POST | `/api/users` | Lista o crea utenti |
| GET/PUT/PATCH/DELETE | `/api/users/:id` | Gestisce una singola anagrafica |
| GET/POST | `/api/orders` | Lista o crea ordini |
| GET/PUT/DELETE | `/api/orders/:id` | Gestisce un singolo ordine |

### Payload

Prodotto: `{ "name": "Pasta di legumi" }`

Utente: `{ "firstName": "Ada", "lastName": "Lovelace", "email": "ada@example.com" }`

Ordine: `{ "productIds": [1, 2], "userIds": [3, 4] }`

Gli ordini supportano i filtri `createdFrom`, `createdTo` e `productId`, ad esempio:
`GET /api/orders?createdFrom=2026-01-01&createdTo=2026-12-31&productId=2`.

Le liste supportano `limit` e `offset`; `limit` ha un massimo di 100 e il valore predefinito è 100.

## Test

`npm test` esegue i test automatici senza richiedere MySQL. I test usano un repository fake, Supertest e Sinon per isolare la logica HTTP e verificare anche le chiamate alle dipendenze.

## Sicurezza e scelte tecniche

- Le query MySQL usano placeholder parametrizzati; `multipleStatements` è disabilitato.
- I nomi dinamici delle risorse sono interni e non derivano dall’input dell’utente.
- Gli input sono validati prima di raggiungere il repository.
- Gli ordini sono salvati in transazione per mantenere consistenti le relazioni.
- Le liste sono paginate e le query per ID ordine non caricano l’intera tabella in memoria.
- Le credenziali in `.env` sono esclusivamente locali: non committare mai secret reali e ruotare immediatamente password eventualmente esposte.
- I codici HTTP principali sono `201 Created`, `200 OK`, `204 No Content`, `404 Not Found`, `409 Conflict` e `422 Unprocessable Entity`.

## Prerequisiti per la produzione

Questa API non implementa autenticazione/autorizzazione, rate limiting o audit log. Deve quindi essere pubblicata solo dietro un gateway aziendale che fornisca questi controlli, oppure tali capacità devono essere aggiunte prima dell’esposizione su Internet.
