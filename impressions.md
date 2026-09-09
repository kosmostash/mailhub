# Impressions: building MailHub on KosmoJS

Notes from implementing the [MailHub specification](#) on KosmoJS 0.5.0, written
down while it was fresh. The vantage point matters for calibrating them:

- **No prior KosmoJS experience.** Everything here came from the docs, read cold
  before writing any code.
- **One sitting**, in a headless container: no dev server, no file watcher, no
  editor. Routes were created as empty files and filled by `kosmo build`, which
  is the path [Notes for LLM Agents](https://kosmojs.dev/agents) prescribes for
  exactly this situation.
- **A non-trivial app.** Three source folders, two worker processes, ~12k lines,
  a three-level role hierarchy with impersonation, an SMTP listener, and a
  conformance script that walks the spec's acceptance scenario against the real
  build.

Which is to say: this is the experience of someone who had to get it right from
the documentation, without the feedback loop of a running dev server. That is a
harsher test than the normal one, and KosmoJS came out of it well.

---

## What pleased

**Source folders turned out to be load-bearing, not organisational.** The
specification draws a hard line (§3.1) between endpoints that may face the
internet and endpoints that may not. I expected to solve that with a reverse
proxy and a comment. Instead the folder *was* the mechanism: `src/submit` at
`/api` private, `src/hooks` at `/api/webhooks` public, `src/hub` for the app —
three configs, no glue. And they stayed splittable: one process via
`dist/run.js`, or three, deployed apart, with nothing in the code aware of the
difference. That is the feature working exactly as advertised.

The prefix table printed at startup deserves a specific mention:

```
  /api/webhooks            -> hooks
  /hub/api                 -> hub
  /api                     -> submit
  /                        -> hub
```

Longest-prefix dispatch, shown as a fact rather than a promise. I never once
wondered which folder a URL would reach.

**`@/` did what workspaces usually do, without being workspaces.** Every rule in
this app lives in `domain/` exactly once, and is imported by three source folders
and two worker processes. No `packages/shared`, no version bumps, no build
ordering. It is a small idea with a large payoff, and it is the single thing I
would point at when explaining why this isn't just Vite with conventions.

**Type-derived validation is the real thing, not a demo.** One declaration in
`@/domain/wire.ts` produced the runtime validator, the typed fetch client the UI
calls, and the OpenAPI schema — and the error a client project actually gets is
good:

```json
{ "error": "json: missing required properties: \"from\", \"to\", \"subject\"",
  "code": "invalid_payload" }
```

I wrote zero schemas. Having built the same shape of thing with Zod on one side
and hand-written OpenAPI on the other, the difference is not subtle.

**`ResponseT` earned its keep more than I expected.** I reached for
`ResponseT["dashboard"]["GET"]["collections"][number]` constantly — deriving page
prop types from the backend's declaration rather than restating them. Renaming a
field on the server surfaced in the UI at compile time, every time.

**Seeding worked headlessly.** Create empty files, run `kosmo build`, get correct
boilerplate — no watcher, no TTY, deterministic. The `/agents` page says to do
this in containers and CI, and it is right. This is the difference between
KosmoJS being usable by an agent and not.

**`debug: true` on `appFactory` is the best-designed diagnostic here.** It printed
the composed middleware chain per route, and it is what turned a confusing
symptom into a one-minute diagnosis (see below). More frameworks should ship
this.

**The docs are unusually good**, and `/agents` in particular is the page I wish
every framework had. The Silent Failure Checklist is real: I named every domain
type `*T` from the first line *because* of it, and never hit the built-in
collision trap. Docs that tell you how the tool fails are worth more than docs
that tell you how it works.

---

## What surprised

**Validation runs *ahead* of folder middleware.** This is the big one. I assumed
the chain was global `use.ts` → cascading `use.ts` → route `use` → handler, with
validation somewhere in the handler's vicinity. `debug: true` showed otherwise:

```
 /api/emails  [ emails/index.ts ]
   methods: POST
middleware: slot: @extendContext useExtendContext
            slot: validate:params useValidateParams
            slot: validate:json   ...
            requestId
            authorizeCollection      ← my cascading use.ts, dead last
   handler: async (ctx) => {
```

The consequence was concrete: an unknown collection id with a malformed body got
`422` describing my payload schema, when §3.1 requires `401` about the id. An
unauthenticated caller was learning the shape of my API before being told it was
unauthenticated.

The design is defensible — validating before the handler chain is a reasonable
default, and the escape hatch (native `app.use` in `api/app.ts`) is documented
and works perfectly. What surprised me is that *nothing in the middleware docs
mentions where validation sits relative to `use.ts`*. The ordering section covers
global vs cascading vs route, and stops there. I'd suggest one paragraph:
"validation slots are composed ahead of all folder middleware; if you need a
check to run before a body is parsed, register it natively in `api/app.ts`."

**`dist/run.js` reads every directory under `dist/` as a source folder.** I put
the worker bundles in `dist/workers/` and the whole server died:

```
Error [ERR_MODULE_NOT_FOUND]: Cannot find module '/…/dist/workers/kosmo.json'
```

`readFolders()` iterates `dist/` and imports `<dir>/kosmo.json` unconditionally.
Moving the workers to `dist-workers/` fixed it in seconds, but the failure mode
is a hard crash of the entire application over a directory that has nothing to do
with it. Skipping directories without a manifest would be a two-line change and a
much friendlier failure.

**`npm create kosmo .` produced `base: "/app"`, not `/`.** Both `docs/essentials/cli.md`
and the FAQ say "the first folder is always `app`, with its pages at `/` and its
API at `/api`". Bootstrapping into the current directory gave me `/app` and
`/app/api`. Trivially fixed by editing the config — which the docs explicitly say
is expected — but it is a doc/behaviour mismatch worth closing.

**TypeScript 7 in the scaffold.** Genuinely didn't expect it, and it was fine.

---

## What confused

**Where to typecheck the shared root.** `kosmo typecheck` is per source folder, by
design and for good reasons. But `@/` code — `db/`, `domain/`, `workers/` — belongs
to no folder, so nothing checks it. The obvious move, `tsc -p tsconfig.json` at
the root, fails immediately:

```
lib/hub/app.tsx(15,5): error TS17004: Cannot use JSX unless the '--jsx' flag is provided.
```

…because the root config includes derived `lib/` output, which contains JSX I
don't own. I wrote a `tsconfig.shared.json` and moved on, but `@/` is presented
as a first-class concept and there is no first-class way to check it. Either a
`kosmo typecheck --shared`, or a documented recipe, would close this.

**`VRefine` is only in scope where `lib/env.d.ts` is included.** Following on from
the above: I wanted refined types (`VRefine<string, { format: "email" }>`) in
`@/domain/wire.ts`, shared across folders. That works at build time, but my
standalone tsconfig didn't see the global declaration until I added
`"lib/env.d.ts"` to its `include`. Perfectly logical in hindsight; nowhere
documented, and a slightly odd thing to have to know about a global.

**No convention for folder-local server helpers.** `@/` is the project, `~/` is the
folder, `_/` is derived. Clear. But where inside a folder do shared *backend*
helpers go — the ones used by six routes but that aren't routes? I invented
`src/hub/server/` and `src/hub/types/`, which is fine, but I was guessing. The
docs are emphatic that only `index.ts` and `use.ts` are special, which answers
"will this be scanned?" but not "where do people put this?".

**Whether non-stack Vite plugins belong in `viteConfig.plugins`.** The stack docs
carry a warning box — "Don't also list the plugin in `viteConfig.plugins`" — which
on first read scans as a general prohibition. It's about the *stack* plugin
specifically, and the configuration reference does show `plugins: [tailwindcss()]`,
which settled it. Ten seconds of doubt, but the warning is placed where a
first-time reader meets it before the counter-example.

---

## What annoyed

**No story at all for non-HTTP processes.** The specification requires a
background sender and an SMTP listener, both as separate processes (§3.6, §4.1).
KosmoJS builds source folders, and a source folder is an HTTP app. So I added
esbuild, wrote `scripts/build-workers.mjs`, wired `tsx` for dev — and then hit
the `dist/` collision above. None of that was hard, but all of it was mine to
invent, and every real backend eventually grows a worker. Even a documented
pattern ("workers are plain entry points; bundle them beside `distDir`; here is a
20-line esbuild script") would have saved an hour and one outage.

**Nothing loads `.env`.** Vite handles `import.meta.env` for the client, but
nothing populates `process.env` for the API side or for workers. I wrote
`domain/config.ts` to read and coerce environment variables myself, which I'd
probably do anyway for the validation — but every neighbouring framework does the
loading part for you, and `node --env-file` exists.

**`kosmo typecheck` stops at the first failing folder.** With three folders, a
mistake in `hub` hid whatever was wrong in `submit` until the next round. A
`--continue` flag, or just checking all and reporting once, would tighten the
loop.

**Every `use.ts` must export `UseT`, and forgetting it fails in derived code.**
The docs do say "even if empty", so this is my miss. But the error arrives
pointing at a file I don't own and never opened:

```
lib/hub/@api/routes.ts:72:41 - error TS2614:
  Module '"@/src/hub/api/admins/use.ts"' has no exported member 'UseT'.
```

The message is accurate and the fix is obvious once you've seen it once. Naming
the *source* file first would make it obvious the first time.

---

## What I missed, coming from other full-stack frameworks

Ordered by how much I actually felt the absence.

**1. A worker/job convention.** Covered above, but it belongs here too: Rails has
ActiveJob, Phoenix has Oban in every other tutorial, Adonis ships a Bull
integration. KosmoJS's "you keep control" stance is coherent, and I don't want a
bundled queue — but the *build and deploy shape* of a background process is a
framework concern, and right now it's undefined.

**2. A database and migration pattern.** I hand-rolled a migration runner over
`PRAGMA user_version` in about 40 lines, which was fine and which I'd defend. But
this is the single most universal thing a backend needs, and "bring your own" is
the answer from Next and Nuxt while Rails, Phoenix, Adonis and Laravel all have
opinions. A cookbook page — not a bundled ORM — showing one worked setup would
lower the floor a lot.

**3. A testing story.** There is no guidance on testing routes. I ended up testing
the domain layer directly with an in-memory SQLite and treating HTTP as a
black box via a conformance script, which I think is the *right* shape — but I
arrived there by reasoning, not by following a path. Hono and H3 both expose
`app.fetch`; a documented `createTestClient(app)` helper, or even just a page
saying "here is how to exercise a route in-process", would be a cheap win. This
is table stakes in the SvelteKit and Remix ecosystems.

**4. An auth cookbook.** The docs are explicit that there's no bundled auth and no
NextAuth-style integration, and I agree with that call — cascading `use.ts` plus
`UseT` turned out to be an *excellent* substrate for role-scoped authorization,
better than middleware in most frameworks I've used, because the types cascade
with the behaviour. But "excellent substrate, no worked example" means everyone
builds the session-cookie-plus-role-gate from scratch. One page showing exactly
that would sell the feature better than the feature page does.

**5. A reference app beyond hello-world.** `create kosmo` gives you a welcome
page. Points 1–4 would all be answered by demonstration if there were one
realistic example app — auth, a database, a couple of resources, a worker — in
the org. It would also give the framework somewhere to prove the multi-folder
claim, which is its most distinctive one and the hardest to feel from a
single-folder starter.

**What I did *not* miss**, worth saying because absence-lists skew negative:

- **SSR.** A session-gated admin app gains nothing from it, and leaving it off
  meant dev and production behaved identically. Being able to just… not have it,
  per folder, is a feature.
- **A tRPC-shaped RPC layer.** The derived fetch client is a better answer for
  this shape of app: same end-to-end types, but the endpoints stay real HTTP that
  a curl or another language's client can hit. My submission API is consumed by
  the UI *and* by arbitrary client projects, and one mechanism served both.
- **Anything OpenAPI-adjacent.** Next, Nuxt and SvelteKit give you nothing here.
  Getting a spec derived from the same types that validate the requests is a
  genuine differentiator and I'd lead with it harder.

---

## The short version

The multi-folder architecture is the real product, and it held up under a
specification that demanded exactly that shape. Type-derived validation is not a
gimmick. The documentation is above average and `/agents` is genuinely ahead of
the field.

The gaps are all at the edges of "an HTTP app": processes that aren't servers,
data that outlives a request, and the shared code that sits between folders. None
of them are architectural problems — they're missing paragraphs and one small
`readFolders` guard. The one thing I'd fix in the code rather than the docs is
that `dist/run.js` crash.

Would I use it again for something this shape? Yes, and specifically *because* of
the thing that is hardest to get from a starter template: three deployable
surfaces sharing one domain layer, with no packaging ceremony between them.
