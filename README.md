# MailHub

> One self-hosted hub to store, review, and send the emails from all your projects.

Your projects stop talking to mail providers. They submit to MailHub instead, which
**stores** every message, optionally **holds it for review**, **sends** it through a
provider you configured once, and **tracks** what happened to it. One web interface
covers every project at once.

An implementation of the [MailHub functional specification](#the-specification),
built on [KosmoJS](https://kosmojs.dev).

```
   your projects                    MailHub                        the world
  ┌──────────────┐   HTTP      ┌──────────────────┐
  │ signup app   │────────────▶│                  │            ┌──────────────┐
  │ billing job  │             │   store          │  provider  │  SMTP relay  │
  │ legacy app   │────────────▶│   review         │───────────▶│  or hosted   │
  └──────────────┘   SMTP      │   send           │            │  API         │
                               │   track          │◀───────────│  webhooks    │
                               └──────────────────┘            └──────────────┘
                                        ▲
                                        │  one web app: operators do the work,
                                        │  admins oversee it, one superadmin
                                        │  above them
```

---

## Quick start

```sh
npm install
cp .env.example .env          # optional - every value has a working default
npm run build                 # builds all three folders plus the two workers
npm start                     # the hub, the submission API and the webhooks
```

Open <http://localhost:4556>. On a fresh install the app proposes creating the
**superadmin** — the account above all admins. Create it and you are signed in.

Then, in two more terminals:

```sh
npm run start:sender          # drains ready mail through its provider
npm run start:smtp            # accepts submissions over SMTP on :2525
```

For development, `npm run dev` serves all three source folders with HMR, and
`npm run dev:sender` / `npm run dev:smtp` run the workers under `tsx watch`.

### Sending your first email

1. As the superadmin, create an **admin**.
2. As that admin, create an **SMTP provider** and an **operator**.
3. **Impersonate** the operator and create a **collection** — the UI shows its id.
4. Point a project at it:

```sh
curl -X POST http://localhost:4556/api/emails \
  -H 'content-type: application/json' \
  -H "x-collection-id: $COLLECTION_ID" \
  -d '{
        "from": { "address": "app@example.com", "name": "My App" },
        "to":   [{ "address": "someone@example.com" }],
        "subject": "Hello",
        "text": "It works.",
        "html": "<p>It works.</p>"
      }'
```

Or point any existing mailer at MailHub's SMTP listener, using the collection id
as the password. Nothing else about that app has to change.

---

## How it is put together

MailHub is one KosmoJS project with **three source folders** and **two workers**.
The folders are not an organisational flourish: the specification (§3.1) draws a
hard line between what may face the internet and what may not, and a source folder
is the unit that can be routed, bound and deployed on its own.

| Folder | Stack | Serves | Exposure |
| --- | --- | --- | --- |
| `src/hub` | React + Hono | pages at `/`, its API at `/hub/api` | may be public — session-authenticated, role-scoped |
| `src/submit` | Hono | `/api/emails`, `/api/health` | **private** — LAN/DMZ only |
| `src/hooks` | Hono | `/api/webhooks/{provider}` | **public** — providers call in, signature-verified |

They share one install, one `node_modules`, one set of types — and one domain
layer, at the project root, reached through `@/`:

```
db/                 schema as a module, numbered migrations, row mappers
domain/             the rules: accounts, sessions and impersonation,
                    collections, providers, the email lifecycle, the sender,
                    the activity trail, system mail, the credential gate
workers/            the background sender and the SMTP listener
src/hub/            the web application
src/submit/         the submission API
src/hooks/          the delivery-event webhook
scripts/            the worker build, and the §8 conformance walk-through
tests/              the domain rules, under test
```

Every rule lives in `domain/` exactly once. The three folders and the two workers
are five entry points into the same implementation, which is why a rule cannot
hold over HTTP and quietly not hold over SMTP.

### The web application

Tailwind v4 (configured in CSS, in `src/hub/styles.css`) plus a set of
[shadcn/ui](https://ui.shadcn.com) components vendored into
`src/hub/components/ui/` — copied source rather than an installed design system,
which is the same bargain KosmoJS makes about frameworks. Radix supplies the
behaviour underneath: dialogs that trap and restore focus, menus that work from
the keyboard, a select that is not a `<select>` pretending.

Two conventions worth knowing before editing it:

- `components/ui/` is a general-purpose kit that could belong to any app.
  `components/domain.tsx` is the layer above it that knows an email has a
  lifecycle state and that a collection id is a credential.
- The four lifecycle colours are theme tokens (`--pending`, `--ready`,
  `--sent`, `--bounced`), not neutral greys. They are the two orthogonal axes of
  §2.7, read at a glance across a hundred rows, so they survive the palette.

There are no `window.confirm` or `window.prompt` calls. Destructive actions get
a dialog that spells out the consequence — disabling an admin revokes a whole
subtree's sessions — and the irreversible ones ask you to type the object's name.

### Where authorization lives, and why

Two mechanisms, chosen for different reasons:

**Authentication is native middleware in `api/app.ts`.** KosmoJS composes payload
validation into each route's chain *ahead* of folder middleware. That is the right
default — but §3.1 and §5.1 both want the credential checked before anything parses
a body, so an unknown collection id gets a `401` about itself rather than a `422`
about our schema. Registering the check on the Hono instance puts it in front.

**Authorization is cascading `use.ts`.** `providers/`, `operators/`, `admins/` and
`emails/actions/` each carry one: every method beneath them is role-gated the same
way, and each exports a `UseT` that hands the routes below a typed identity with no
imports. Where a subtree mixes reads every role may make with writes only an
operator may — `collections/` — there is deliberately no gate, and the domain stays
the single authority instead.

### Validation, clients and the spec, from one declaration

Request and response shapes are TypeScript types in `@/domain/wire` and
`src/hub/types/views`. KosmoJS derives the runtime validators, the typed fetch
clients the UI calls, and the OpenAPI 3.1 spec at `src/submit/openapi.json` from
those same declarations — so the contract a client project programs against and the
check the server actually runs cannot drift.

---

## The model in one screen

Three roles, three levels:

```
superadmin ──▶ admins ──▶ operators ──▶ collections ──▶ emails
                 └────▶ providers (usable by that admin's operators)
```

- **Operators** do the work: collections, review, sending.
- **Admins** oversee operators and own the **providers** they send through —
  delivery credentials are infrastructure, so they never sit in operators' hands.
  Admins are mutually invisible.
- The **superadmin** exists to answer one question: what happens when an admin
  misbehaves. It manages admins and observes everything, read-only.

Neither oversight role writes in its own identity. They **impersonate** instead —
audited, one level at a time, and marked in the UI at all times.

An email is in exactly one of three states, and there are no other transitions:

```
pending ──(approve)──▶ ready ──(successful send)──▶ sent
```

Orthogonal to that, a **delivery status** records what the provider reported:
`unknown → sent → delivered | bounced`. Plain SMTP has no feedback channel, so
acceptance is the last word; providers with an event feed move it on via webhooks.

---

## Operating it

### Deployment

`npm run build` writes `dist/` (one directory per source folder, plus `run.js`) and
`dist-workers/` — beside `dist/`, not inside it, because `dist/run.js` reads every
directory in there as a source folder.

The simple path is one process for everything plus the two workers:

```sh
node dist/run.js -p 4556
node dist-workers/sender.js
node dist-workers/smtp.js
```

The specification's trust zones become a deployment split when you want one, since
each folder also runs on its own:

```sh
node dist/hub/api/server.js     -p 4556   # + serve dist/hub/client statically
node dist/submit/api/server.js  -p 4557   # bind to the private interface only
node dist/hooks/api/server.js   -p 4558   # the only one that faces the internet
```

Put the submission API and the SMTP listener where only your own backends can reach
them. The webhook endpoint is the one that has to be reachable from outside, and it
carries its own protection: set `MAILHUB_WEBHOOK_KEYS` and events are verified as
HMAC-SHA256 over the raw request body, in `x-mailhub-signature`.

### The database

SQLite, in WAL mode, at `MAILHUB_DB`. Migrations are numbered and run at startup, so
deploying is copying files and restarting. Back it up by copying the file (or with
`sqlite3 ... ".backup"`) — it holds the accounts, every stored email, and the trail.

### Configuration

See [`.env.example`](.env.example) — every setting, with a working default and a
note on what it is for. The two worth setting on any real install are
`MAILHUB_SESSION_SECRET` and the `MAILHUB_SYSTEM_MAIL_*` block. Without the latter,
confirmation codes are written to the log instead of being emailed, which is fine
for a first run and not fine afterwards.

### Adding a provider type

`domain/delivery/` holds a registry. A type may be registered without being
implemented: it configures and saves, and a send through it fails with a clear
"not implemented" rather than dropping the email. To implement one, write a
`TransportFactoryT` beside `smtp.ts` and register it — nothing above that interface
changes. A provider-native webhook format plugs into `domain/webhooks.ts` the same
way.

---

## Testing

```sh
npm test           # the domain rules - fast, in-memory, no HTTP
npm run typecheck  # per source folder, plus the shared root
npm run build && npm run conformance
```

`npm test` covers what §2 calls behaviour: one superadmin ever, mutual admin
invisibility, disable/reassign/delete, the three lifecycle transitions and no
others, the attempt cap and the human override, test copies leaving the stored
email untouched, and where each confirmation code is sent. Delivery is exercised
against a real SMTP socket rather than a stubbed transport.

`npm run conformance` is the walk-through from §8 of the specification, run against
the production entry point, the real workers and a real SMTP server — 82 checks,
step by step, printed as it goes. It is the honest answer to "does this actually
work": it builds nothing, mocks nothing and touches no internals.

```
5 · the background sender drains B with no human action
  ✓ B's email sends with no human action
  ✓ its state becomes sent
  ✓ plain SMTP acceptance counts as delivery status sent
  ✓ A's email is not sent - it is awaiting review
  ✓ one collection cannot poll another's email
```

---

## What is deliberately not here

Following §7, plus two calls of our own:

- **No 2FA.** The specification makes implementing it optional and the *gate*
  mandatory. Every credential change goes through an emailed one-time code, and
  `domain/secondFactor.ts` is the seam a TOTP module would register into — at which
  point the code path steps aside for it, as §2.1.7 requires.
- **No SSR.** A session-gated admin application gains nothing from it, and leaving
  it off keeps development behaviour identical to production.
- Roles beyond the three; operator self-registration; transfers between *active*
  accounts; self-service password recovery (an administrative reset is the way back
  in); templates or content authoring; scheduled sends; quotas; editing a stored
  email.

---

## The specification

This implementation follows the MailHub functional specification. Section
references throughout the source — `§2.1.5`, `§4.2`, and so on — point at the
clause a piece of code exists to satisfy, so a rule can be traced from the spec to
the line that keeps it.

## License

MIT
