/**
 * The §8 conformance walk-through, run against a real installation.
 *
 * This is not a unit test: it builds nothing, mocks nothing and reaches into
 * no internals. It starts the production entry point (`dist/run.js`), the
 * background sender and the SMTP listener as separate processes against a
 * throwaway database, and then walks the specification's eleven steps over
 * HTTP and SMTP exactly as a client project and a signed-in user would.
 *
 *   npm run build && npm run conformance
 *
 * An SMTP sink stands in for the outside world twice over: it is what the
 * configured provider delivers into, and it is where system email (§2.1.8)
 * goes, which is how the walk-through reads confirmation codes.
 */

import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import process from "node:process";

import nodemailer from "nodemailer";
import { SMTPServer } from "smtp-server";

// ── tiny harness ────────────────────────────────────────────────────────────

let failures = 0;
let checks = 0;
let step = "";

const heading = (title) => {
  step = title;
  console.log(`\n\x1b[1m${title}\x1b[0m`);
};

const check = (label, condition, detail) => {
  checks += 1;
  if (condition) {
    console.log(`  \x1b[32m✓\x1b[0m ${label}`);
    return true;
  }
  failures += 1;
  console.log(`  \x1b[31m✗\x1b[0m ${label}`);
  if (detail !== undefined) {
    console.log(`      ${typeof detail === "string" ? detail : JSON.stringify(detail)}`);
  }
  return false;
};

const fail = (message) => {
  throw new Error(`[${step}] ${message}`);
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Poll until `predicate` holds, then record it as a check either way. */
const until = async (label, predicate, timeoutMs = 15_000) => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await predicate()) return check(label, true);
    await sleep(200);
  }
  return check(label, false, `timed out after ${timeoutMs}ms`);
};

const freePort = () =>
  new Promise((resolve, reject) => {
    const probe = createServer();
    probe.on("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const { port } = probe.address();
      probe.close(() => resolve(port));
    });
  });

// ── the outside world ───────────────────────────────────────────────────────

const startSink = async () => {
  const messages = [];
  const server = new SMTPServer({
    authOptional: true,
    disabledCommands: ["STARTTLS"],
    onData(stream, session, callback) {
      const chunks = [];
      stream.on("data", (chunk) => chunks.push(chunk));
      stream.on("end", () => {
        messages.push({
          to: session.envelope.rcptTo.map(({ address }) => address),
          data: Buffer.concat(chunks).toString("utf8").replace(/=\r?\n/g, ""),
        });
        callback();
      });
    },
  });

  const port = await freePort();
  await new Promise((resolve) => server.listen(port, "127.0.0.1", resolve));

  return {
    port,
    messages,
    to: (address) => messages.filter((message) => message.to.includes(address)),
    close: () => new Promise((resolve) => server.close(resolve)),
  };
};

/** Pull a six-digit confirmation code out of the newest message to `address`. */
const codeFor = (sink, address) => {
  const message = [...sink.to(address)].pop();
  if (!message) fail(`no system email reached ${address}`);
  const match = /confirmation code is: (\d{6})/.exec(message.data);
  if (!match) fail(`no confirmation code in the message to ${address}`);
  return match[1];
};

// ── a browser, and a client project ─────────────────────────────────────────

/**
 * A cookie-carrying HTTP client. Each `browser()` is an independent signed-in
 * session, which is how the walk-through keeps the superadmin, both admins and
 * the operator apart.
 */
const browser = (origin) => {
  let cookie = "";

  const call = async (method, path, body, headers = {}) => {
    const response = await fetch(`${origin}${path}`, {
      method,
      headers: {
        ...(body === undefined ? {} : { "content-type": "application/json" }),
        ...(cookie ? { cookie } : {}),
        ...headers,
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });

    const setCookie = response.headers.get("set-cookie");
    if (setCookie) cookie = setCookie.split(";")[0];

    const text = await response.text();
    let payload;
    try {
      payload = text ? JSON.parse(text) : undefined;
    } catch {
      payload = text;
    }

    return { status: response.status, body: payload };
  };

  return {
    get: (path, headers) => call("GET", path, undefined, headers),
    post: (path, body, headers) => call("POST", path, body ?? {}, headers),
    put: (path, body) => call("PUT", path, body ?? {}),
    del: (path) => call("DELETE", path),
    forget: () => {
      cookie = "";
    },
  };
};

// ── processes ───────────────────────────────────────────────────────────────

const children = [];

const spawnChild = (label, args, env) => {
  const child = spawn(process.execPath, args, {
    env: { ...process.env, ...env },
    stdio: ["ignore", "pipe", "pipe"],
  });

  const prefix = `\x1b[90m[${label}]\x1b[0m`;
  const log = (buffer) => {
    if (process.env.CONFORMANCE_VERBOSE) {
      for (const line of buffer.toString().trimEnd().split("\n")) {
        console.log(`${prefix} ${line}`);
      }
    }
  };
  child.stdout.on("data", log);
  child.stderr.on("data", log);

  children.push(child);
  return child;
};

const stopChildren = async () => {
  for (const child of children) child.kill("SIGTERM");
  await sleep(300);
  for (const child of children) if (!child.killed) child.kill("SIGKILL");
};

// ── the walk-through ────────────────────────────────────────────────────────

const PASSWORD = "conformance-password";

const main = async () => {
  const dataDir = mkdtempSync(join(tmpdir(), "mailhub-conformance-"));
  const sink = await startSink();
  const httpPort = await freePort();
  const smtpPort = await freePort();
  const origin = `http://127.0.0.1:${httpPort}`;

  const env = {
    MAILHUB_DB: join(dataDir, "mailhub.db"),
    MAILHUB_SESSION_SECRET: "conformance-secret",
    MAILHUB_SECURE_COOKIES: "false",
    MAILHUB_SMTP_HOST: "127.0.0.1",
    MAILHUB_SMTP_PORT: String(smtpPort),
    MAILHUB_SENDER_INTERVAL_MS: "400",
    // System email goes out through the installation's own path, which the
    // walk-through points at the sink so it can read confirmation codes.
    MAILHUB_SYSTEM_MAIL_HOST: "127.0.0.1",
    MAILHUB_SYSTEM_MAIL_PORT: String(sink.port),
    MAILHUB_WEBHOOK_KEYS: "",
    NODE_ENV: "production",
  };

  spawnChild("server", ["dist/run.js", "-p", String(httpPort)], env);
  spawnChild("smtp", ["dist-workers/smtp.js"], env);
  spawnChild("sender", ["dist-workers/sender.js"], env);

  const ready = await until(
    "the installation comes up",
    async () => {
      try {
        const response = await fetch(`${origin}/api/health`);
        return response.status === 200;
      } catch {
        return false;
      }
    },
    30_000,
  );
  if (!ready) fail("the server never became healthy");

  const root = browser(origin);
  const one = browser(origin);
  const two = browser(origin);
  const o1 = browser(origin);

  // ── 1 ─────────────────────────────────────────────────────────────────────
  heading("1 · first run creates the superadmin, once and only once");

  const fresh = await root.get("/hub/api/session");
  check("a fresh install proposes creating the superadmin", fresh.body?.needsBootstrap === true, fresh.body);

  const created = await root.post("/hub/api/bootstrap", {
    email: "root@mailhub.test",
    password: PASSWORD,
  });
  check("creating it signs you straight in", created.status === 201 && created.body?.actor?.identity?.role === "superadmin", created.body);

  const reloaded = await root.get("/hub/api/session");
  check("reloading offers regular sign-in, not the proposal", reloaded.body?.needsBootstrap === false, reloaded.body);

  const second = await browser(origin).post("/hub/api/bootstrap", {
    email: "other@mailhub.test",
    password: PASSWORD,
  });
  check("no path exists to a second superadmin", second.status === 409, second.body);

  // ── 2 ─────────────────────────────────────────────────────────────────────
  heading("2 · the superadmin creates admins, who cannot see each other");

  const adminOne = await root.post("/hub/api/admins", { email: "one@mailhub.test", password: PASSWORD });
  const adminTwo = await root.post("/hub/api/admins", { email: "two@mailhub.test", password: PASSWORD });
  check("admin one created", adminOne.status === 201, adminOne.body);
  check("admin two created", adminTwo.status === 201, adminTwo.body);

  await one.post("/hub/api/session", { email: "one@mailhub.test", password: PASSWORD });
  await two.post("/hub/api/session", { email: "two@mailhub.test", password: PASSWORD });

  const twoCannotManageAdmins = await two.get("/hub/api/admins");
  check("an admin cannot reach admin management", twoCannotManageAdmins.status === 403, twoCannotManageAdmins.body);

  // ── 3 ─────────────────────────────────────────────────────────────────────
  heading("3 · admin one sets up a provider, an operator, and two collections");

  const provider = await one.post("/hub/api/providers", {
    name: "Relay",
    type: "smtp",
    config: { host: "127.0.0.1", port: sink.port, secure: false },
  });
  check("an SMTP provider is created", provider.status === 201, provider.body);
  check("its secrets are not echoed back", provider.body?.config?.pass === undefined, provider.body?.config);

  const operator = await one.post("/hub/api/operators", { email: "o1@mailhub.test", password: PASSWORD });
  check("operator O1 is created", operator.status === 201, operator.body);

  const impersonation = await one.post("/hub/api/impersonation", { userId: operator.body.id });
  check(
    "impersonating O1 carries the operator's capabilities",
    impersonation.body?.actor?.impersonating === true &&
      impersonation.body?.actor?.identity?.email === "o1@mailhub.test" &&
      impersonation.body?.actor?.capabilities?.manageCollections === true,
    impersonation.body,
  );

  const collectionA = await one.post("/hub/api/collections", {
    name: "A",
    scheduleMode: "after_review",
    providerId: provider.body.id,
  });
  const collectionB = await one.post("/hub/api/collections", {
    name: "B",
    scheduleMode: "immediate",
    providerId: provider.body.id,
  });
  check("collection A (after_review) is created while impersonating", collectionA.status === 201, collectionA.body);
  check("collection B (immediate) is created while impersonating", collectionB.status === 201, collectionB.body);

  const back = await one.del("/hub/api/impersonation");
  check("impersonation ends in one step", back.body?.actor?.impersonating === false, back.body);

  const idA = collectionA.body.id;
  const idB = collectionB.body.id;

  const twoSeesNothing = await two.get("/hub/api/dashboard");
  check("admin two sees none of admin one's collections", (twoSeesNothing.body?.collections ?? []).length === 0, twoSeesNothing.body);

  const rootSeesBoth = await root.get("/hub/api/dashboard");
  check("the superadmin sees both trees", (rootSeesBoth.body?.collections ?? []).length === 2, rootSeesBoth.body);

  const rootCannotWrite = await root.post("/hub/api/collections", {
    name: "nope",
    scheduleMode: "immediate",
  });
  check("the superadmin has no CRUD of its own", rootCannotWrite.status === 403, rootCannotWrite.body);

  // ── 4 ─────────────────────────────────────────────────────────────────────
  heading("4 · the submission API: HTTP and SMTP");

  const payload = (subject) => ({
    from: { address: "app@example.test", name: "App" },
    to: [{ address: "user@example.test" }],
    subject,
    text: `body of ${subject}`,
    html: `<p>body of <b>${subject}</b></p>`,
  });

  const client = browser(origin);

  const intoA = await client.post("/api/emails", payload("held for review"), { "x-collection-id": idA });
  check("submitting to A stores it pending", intoA.status === 201 && intoA.body?.state === "pending", intoA.body);

  const intoB = await client.post("/api/emails", payload("straight through"), { "x-collection-id": idB });
  check("submitting to B stores it ready", intoB.status === 201 && intoB.body?.state === "ready", intoB.body);

  const bogus = await client.post("/api/emails", payload("nope"), { "x-collection-id": "col_nonsense" });
  check("a bogus collection id is 401", bogus.status === 401, bogus.body);

  const bodyless = await client.post(
    "/api/emails",
    { from: { address: "a@b.test" }, to: [{ address: "c@d.test" }], subject: "no body" },
    { "x-collection-id": idA },
  );
  check("neither text nor html is 422", bodyless.status === 422, bodyless.body);

  const health = await client.get("/api/health");
  check("health needs no credential", health.status === 200, health.body);

  const overSmtp = nodemailer.createTransport({
    host: "127.0.0.1",
    port: smtpPort,
    secure: false,
    auth: { user: "mailhub", pass: idA },
  });
  await overSmtp.sendMail({
    from: "Legacy App <legacy@example.test>",
    to: "user@example.test",
    subject: "submitted over SMTP",
    text: "sent by something that only speaks SMTP",
  });
  overSmtp.close();
  check("an SMTP submission is accepted", true);

  const badCredential = nodemailer.createTransport({
    host: "127.0.0.1",
    port: smtpPort,
    secure: false,
    auth: { user: "mailhub", pass: "col_nonsense" },
  });
  let smtpRejected = false;
  try {
    await badCredential.sendMail({
      from: "a@b.test",
      to: "c@d.test",
      subject: "should not land",
      text: "x",
    });
  } catch {
    smtpRejected = true;
  }
  badCredential.close();
  check("a bogus SMTP credential is rejected at AUTH", smtpRejected);

  // ── 5 ─────────────────────────────────────────────────────────────────────
  heading("5 · the background sender drains B with no human action");

  const sentWithoutHelp = await until("B's email sends with no human action", async () => {
    const polled = await client.get(`/api/emails/${intoB.body.id}`, { "x-collection-id": idB });
    return polled.body?.state === "sent";
  });
  if (sentWithoutHelp) {
    const polled = await client.get(`/api/emails/${intoB.body.id}`, { "x-collection-id": idB });
    check("its state becomes sent", polled.body.state === "sent", polled.body);
    check("plain SMTP acceptance counts as delivery status sent", polled.body.deliveryStatus === "sent", polled.body);
  }

  const stillHeld = await client.get(`/api/emails/${intoA.body.id}`, { "x-collection-id": idA });
  check("A's email is not sent - it is awaiting review", stillHeld.body?.state === "pending", stillHeld.body);

  const crossCollection = await client.get(`/api/emails/${intoA.body.id}`, { "x-collection-id": idB });
  check("one collection cannot poll another's email", crossCollection.status === 404, crossCollection.body);

  // ── 6 ─────────────────────────────────────────────────────────────────────
  heading("6 · O1 reviews, approves, sends, and sends a copy to itself");

  await o1.post("/hub/api/session", { email: "o1@mailhub.test", password: PASSWORD });

  const listA = await o1.get(`/hub/api/collections/${idA}/emails`);
  check("emails awaiting review are listed first", listA.body?.emails?.[0]?.state === "pending", listA.body?.emails?.map((e) => e.state));
  check("the SMTP submission landed in A as pending", listA.body?.emails?.some((e) => e.subject === "submitted over SMTP" && e.state === "pending"), listA.body?.emails);

  const approved = await o1.post("/hub/api/emails/actions/approve", { ids: [intoA.body.id] });
  check("approve moves it to ready", approved.body?.outcomes?.[0]?.ok === true, approved.body);

  const sent = await o1.post("/hub/api/emails/actions/send", { ids: [intoA.body.id] });
  check("send delivers it", sent.body?.outcomes?.[0]?.ok === true, sent.body);

  const testAddress = await o1.post("/hub/api/account/test-addresses", {
    address: "me@example.test",
    label: "my inbox",
  });
  check("a test address can be added", testAddress.status === 201, testAddress.body);

  const before = await o1.get(`/hub/api/emails/${intoA.body.id}`);
  const copy = await o1.post("/hub/api/emails/actions/test-send", {
    emailId: intoA.body.id,
    testAddressId: testAddress.body.id,
  });
  check("send to me delivers a copy", copy.body?.sentTo === "me@example.test", copy.body);
  check("the copy is marked as a test", sink.to("me@example.test").some((m) => m.data.includes("[test]")), sink.to("me@example.test").length);

  const after = await o1.get(`/hub/api/emails/${intoA.body.id}`);
  check(
    "the stored email is untouched by a test send",
    after.body.state === before.body.state &&
      after.body.attempts === before.body.attempts &&
      after.body.deliveryStatus === before.body.deliveryStatus,
    { before: before.body, after: after.body },
  );

  // ── 7 ─────────────────────────────────────────────────────────────────────
  heading("7 · delivery events update what the submitting project sees");

  const events = await client.post("/api/webhooks/smtp", {
    events: [
      { emailId: intoA.body.id, status: "delivered" },
      { emailId: intoB.body.id, status: "bounced" },
      { emailId: "00000000-0000-4000-8000-000000000000", status: "delivered" },
    ],
  });
  check("known events match, unknown ones are counted and ignored", events.status === 200 && events.body?.matched === 2, events.body);

  const polledA = await client.get(`/api/emails/${intoA.body.id}`, { "x-collection-id": idA });
  const polledB = await client.get(`/api/emails/${intoB.body.id}`, { "x-collection-id": idB });
  check("the submitting client sees delivered", polledA.body?.deliveryStatus === "delivered", polledA.body);
  check("the submitting client sees bounced", polledB.body?.deliveryStatus === "bounced", polledB.body);

  // ── 8 ─────────────────────────────────────────────────────────────────────
  heading("8 · admin one observes read-only, and disabling O1 bites at once");

  const dashboard = await one.get("/hub/api/dashboard");
  const cardA = dashboard.body?.collections?.find((card) => card.id === idA);
  check("the dashboard shows A and B with counters", (dashboard.body?.collections ?? []).length === 2, dashboard.body?.collections);
  check("counters are live", cardA && cardA.counters.total >= 2, cardA?.counters);

  const adminApprove = await one.post("/hub/api/emails/actions/approve", { ids: [intoA.body.id] });
  check("an admin cannot approve in their own identity", adminApprove.status === 403, adminApprove.body);

  const adminCreate = await one.post("/hub/api/collections", { name: "nope", scheduleMode: "immediate" });
  check("an admin cannot create collections in their own identity", adminCreate.status === 403, adminCreate.body);

  const trail = await one.get("/hub/api/activity");
  const viaImpersonation = trail.body?.entries?.find(
    (entry) => entry.action === "collection.create" && entry.impersonatorEmail === "one@mailhub.test",
  );
  check("the trail marks the impersonated actions", Boolean(viaImpersonation), trail.body?.entries?.slice(0, 5));
  check("it attributes them to the assumed identity", viaImpersonation?.actorEmail === "o1@mailhub.test", viaImpersonation);

  const providerInUse = await one.del(`/hub/api/providers/${provider.body.id}`);
  check("deleting a provider still in use is a conflict", providerInUse.status === 409, providerInUse.body);

  const disabled = await one.put(`/hub/api/operators/${operator.body.id}/status`, { disabled: true });
  check("O1 is disabled", disabled.body?.disabled === true, disabled.body);

  const revoked = await o1.get("/hub/api/dashboard");
  check("O1's session is revoked at once", revoked.status === 401, revoked.body);

  const suspendedSubmit = await client.post("/api/emails", payload("while suspended"), {
    "x-collection-id": idA,
  });
  check("submissions to a suspended collection are 403", suspendedSubmit.status === 403, suspendedSubmit.body);
  check("a suspension is distinguishable from an unknown id", suspendedSubmit.body?.code === "collection_suspended", suspendedSubmit.body);

  const heldEmail = await client.post("/api/emails", payload("held by the suspension"), {
    "x-collection-id": idB,
  });
  check("nothing can be submitted to B either", heldEmail.status === 403, heldEmail.body);

  await one.put(`/hub/api/operators/${operator.body.id}/status`, { disabled: false });
  const resumed = await client.post("/api/emails", payload("after the suspension lifted"), {
    "x-collection-id": idB,
  });
  check("re-enabling resumes submissions", resumed.status === 201, resumed.body);
  await until("and the sender picks the held mail up again", async () => {
    const polled = await client.get(`/api/emails/${resumed.body.id}`, { "x-collection-id": idB });
    return polled.body?.state === "sent";
  });

  // ── 9 ─────────────────────────────────────────────────────────────────────
  heading("9 · credential changes are gated by a confirmation code");

  // O1's session was revoked by the suspension in step 8; sign in again first.
  await o1.post("/hub/api/session", { email: "o1@mailhub.test", password: PASSWORD });

  const wrongCode = await o1.put("/hub/api/account/password", { code: "000000" });
  check("confirming with nothing pending is refused", wrongCode.status === 404, wrongCode.body);

  const askPassword = await o1.post("/hub/api/account/password", {
    currentPassword: PASSWORD,
    newPassword: "a-different-password",
  });
  check("the password code goes to the address on the account", askPassword.body?.sentTo === "o1@mailhub.test", askPassword.body);

  const refused = await o1.put("/hub/api/account/password", { code: "123456" });
  check("a wrong code changes nothing", refused.status === 401, refused.body);

  const confirmedPassword = await o1.put("/hub/api/account/password", {
    code: codeFor(sink, "o1@mailhub.test"),
  });
  check("the right code applies the change", confirmedPassword.status === 200, confirmedPassword.body);

  const withNewPassword = browser(origin);
  const signedIn = await withNewPassword.post("/hub/api/session", {
    email: "o1@mailhub.test",
    password: "a-different-password",
  });
  check("the new password works", signedIn.status === 200, signedIn.body);

  const askEmail = await withNewPassword.post("/hub/api/account/email", { email: "moved@mailhub.test" });
  check("the email code goes to the NEW address", askEmail.body?.sentTo === "moved@mailhub.test", askEmail.body);

  const stillOldAddress = await withNewPassword.get("/hub/api/account");
  check("until confirmed, the account keeps its old address", stillOldAddress.body?.email === "o1@mailhub.test", stillOldAddress.body);

  const confirmedEmail = await withNewPassword.put("/hub/api/account/email", {
    code: codeFor(sink, "moved@mailhub.test"),
  });
  check("confirming moves the address", confirmedEmail.body?.email === "moved@mailhub.test", confirmedEmail.body);

  const noSystemMailStored = await one.get(`/hub/api/collections/${idA}/emails?limit=200`);
  check(
    "no confirmation code shows up as a stored email",
    !(noSystemMailStored.body?.emails ?? []).some((email) => /confirmation code/i.test(email.subject)),
    noSystemMailStored.body?.emails?.map((e) => e.subject),
  );

  // ── 10 ────────────────────────────────────────────────────────────────────
  heading("10 · the superadmin disables admin one, and the whole subtree stops");

  await root.put(`/hub/api/admins/${adminOne.body.id}/status`, { disabled: true });

  const adminEjected = await one.get("/hub/api/dashboard");
  check("admin one's session is revoked", adminEjected.status === 401, adminEjected.body);

  const operatorEjected = await withNewPassword.get("/hub/api/dashboard");
  check("O1's session is revoked with it", operatorEjected.status === 401, operatorEjected.body);

  const cannotSignIn = await browser(origin).post("/hub/api/session", {
    email: "moved@mailhub.test",
    password: "a-different-password",
  });
  check("nobody in the subtree can sign in", cannotSignIn.status === 403, cannotSignIn.body);

  const subtreeSubmit = await client.post("/api/emails", payload("subtree suspended"), {
    "x-collection-id": idA,
  });
  check("submissions to the subtree are 403", subtreeSubmit.status === 403, subtreeSubmit.body);

  const lateEvent = await client.post("/api/webhooks/smtp", {
    events: [{ emailId: intoB.body.id, status: "delivered" }],
  });
  check("delivery webhooks for already-sent mail still land", lateEvent.body?.matched === 1, lateEvent.body);

  await root.put(`/hub/api/admins/${adminOne.body.id}/status`, { disabled: false });
  const signInAgain = await one.post("/hub/api/session", { email: "one@mailhub.test", password: PASSWORD });
  check("re-enabling restores sign-in", signInAgain.status === 200, signInAgain.body);

  const superadminTrail = await root.get("/hub/api/activity");
  const disableEntry = superadminTrail.body?.entries?.find((entry) => entry.action === "admin.disable");
  check("both actions appear in the trail as superadmin actions", disableEntry?.actorEmail === "root@mailhub.test", disableEntry);

  // ── 11 ────────────────────────────────────────────────────────────────────
  heading("11 · reassignment is what makes deletion possible");

  const deleteWhileOwning = await one.del(`/hub/api/operators/${operator.body.id}`);
  check("deleting O1 while it owns A and B is refused", deleteWhileOwning.status === 409, deleteWhileOwning.body);

  const operatorTwo = await one.post("/hub/api/operators", { email: "o2@mailhub.test", password: PASSWORD });
  check("operator O2 is created", operatorTwo.status === 201, operatorTwo.body);

  await one.put(`/hub/api/operators/${operator.body.id}/status`, { disabled: true });
  const reassigned = await one.post(`/hub/api/operators/${operator.body.id}/reassign`, {
    targetId: operatorTwo.body.id,
  });
  check("its collections move to O2", reassigned.status === 200, reassigned.body);

  const movedCard = (await one.get("/hub/api/dashboard")).body?.collections?.find((card) => card.id === idA);
  check("A keeps its id", Boolean(movedCard), idA);
  check("and now belongs to O2", movedCard?.owner?.email === "o2@mailhub.test", movedCard?.owner);

  const clientStillWorks = await client.post("/api/emails", payload("after reassignment"), {
    "x-collection-id": idA,
  });
  check("client projects keep submitting with no config change", clientStillWorks.status === 201, clientStillWorks.body);

  const heldResumes = await client.post("/api/emails", payload("resumed under O2"), {
    "x-collection-id": idB,
  });
  await until("held mail resumes under the new owner", async () => {
    const polled = await client.get(`/api/emails/${heldResumes.body.id}`, { "x-collection-id": idB });
    return polled.body?.state === "sent";
  });

  const deleted = await one.del(`/hub/api/operators/${operator.body.id}`);
  check("the now-empty O1 is deletable", deleted.status === 200, deleted.body);

  const trailSurvives = await one.get("/hub/api/activity");
  check(
    "the trail keeps naming the deleted account",
    (trailSurvives.body?.entries ?? []).some((entry) => entry.actorEmail === "o1@mailhub.test"),
    trailSurvives.body?.entries?.length,
  );

  const populatedAdmin = await root.del(`/hub/api/admins/${adminOne.body.id}`);
  check("a populated admin is not deletable", populatedAdmin.status === 409, populatedAdmin.body);

  await root.put(`/hub/api/admins/${adminTwo.body.id}/status`, { disabled: true });
  const emptyAdmin = await root.del(`/hub/api/admins/${adminTwo.body.id}`);
  check("an emptied, disabled admin is deletable", emptyAdmin.status === 200, emptyAdmin.body);

  // ── done ──────────────────────────────────────────────────────────────────
  await stopChildren();
  await sink.close();
  rmSync(dataDir, { recursive: true, force: true });

  console.log(
    failures === 0
      ? `\n\x1b[32m✓ ${checks} checks passed - the walk-through works end to end\x1b[0m\n`
      : `\n\x1b[31m✗ ${failures} of ${checks} checks failed\x1b[0m\n`,
  );

  process.exit(failures === 0 ? 0 : 1);
};

main().catch(async (error) => {
  console.error("\n\x1b[31mconformance run failed\x1b[0m\n", error);
  await stopChildren();
  process.exit(1);
});
