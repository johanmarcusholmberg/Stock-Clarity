// Auth-matrix integration test for the requireSelf middleware.
//
// We stub `req.auth` directly (the function Clerk's `getAuth(req)` reads
// from) instead of mocking the @clerk/express module. This keeps the test
// resilient across Node test runners and matches what Clerk's middleware
// installs at runtime.
//
// Run: pnpm --filter @workspace/api-server run test

import { test, describe, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import {
  requireSelf,
  requireSelfIfPresent,
  __setSessionResolver,
} from "./requireSelf.ts";

// Each test sets the desired session userId via the resolver hook; we reset
// after every test so leakage between cases is impossible.
let mockedSessionUserId: string | null = null;
__setSessionResolver(() => mockedSessionUserId);
afterEach(() => { mockedSessionUserId = null; });

type FakeRes = {
  status: (code: number) => FakeRes;
  json: (body: unknown) => FakeRes;
  _status?: number;
  _body?: unknown;
};
function makeRes(): FakeRes {
  const r: FakeRes = {
    status(code) { r._status = code; return r; },
    json(body) { r._body = body; return r; },
  };
  return r;
}
function makeReq(opts: {
  params?: Record<string, unknown>;
  query?: Record<string, unknown>;
  body?: Record<string, unknown>;
  sessionUserId?: string | null;
}): any {
  if (opts.sessionUserId !== undefined) mockedSessionUserId = opts.sessionUserId;
  return {
    params: opts.params ?? {},
    query: opts.query ?? {},
    body: opts.body ?? {},
    path: "/test",
    log: { warn: () => {}, info: () => {} },
  };
}

function run(mw: any, req: any, res: any): boolean {
  let nextCalled = false;
  mw(req, res, () => { nextCalled = true; });
  return nextCalled;
}

describe("requireSelf — auth matrix", () => {
  test("400 when no userId is present anywhere", () => {
    const req = makeReq({ sessionUserId: "user_caller" });
    const res = makeRes();
    const nextCalled = run(requireSelf, req, res);
    assert.equal(res._status, 400);
    assert.equal(nextCalled, false);
  });

  test("401 when target userId present but no Clerk session attached", () => {
    const req = makeReq({ query: { userId: "user_target" } });
    const res = makeRes();
    const nextCalled = run(requireSelf, req, res);
    assert.equal(res._status, 401);
    assert.equal(nextCalled, false);
  });

  test("401 when session is attached but userId is null (signed-out token)", () => {
    const req = makeReq({ query: { userId: "user_target" }, sessionUserId: null });
    const res = makeRes();
    const nextCalled = run(requireSelf, req, res);
    assert.equal(res._status, 401);
    assert.equal(nextCalled, false);
  });

  test("403 when session userId differs from target userId", () => {
    const req = makeReq({ query: { userId: "user_target" }, sessionUserId: "user_caller" });
    const res = makeRes();
    const nextCalled = run(requireSelf, req, res);
    assert.equal(res._status, 403);
    assert.equal(nextCalled, false);
  });

  test("next() when session userId matches target userId (query)", () => {
    const req = makeReq({ query: { userId: "user_caller" }, sessionUserId: "user_caller" });
    const res = makeRes();
    const nextCalled = run(requireSelf, req, res);
    assert.equal(res._status, undefined);
    assert.equal(nextCalled, true);
  });

  test("next() when session userId matches target userId (params)", () => {
    const req = makeReq({ params: { userId: "user_caller" }, sessionUserId: "user_caller" });
    const res = makeRes();
    assert.equal(run(requireSelf, req, res), true);
  });

  test("next() when session userId matches target userId (body)", () => {
    const req = makeReq({ body: { userId: "user_caller" }, sessionUserId: "user_caller" });
    const res = makeRes();
    assert.equal(run(requireSelf, req, res), true);
  });

  test("source priority: params > query > body — params wins even with mismatched body", () => {
    const req = makeReq({
      params: { userId: "user_caller" },
      query: { userId: "user_attacker" },
      body: { userId: "user_attacker" },
      sessionUserId: "user_caller",
    });
    const res = makeRes();
    assert.equal(run(requireSelf, req, res), true, "params should take priority");
  });

  test("ATTACK: caller spoofs body.userId — must be rejected", () => {
    const req = makeReq({ body: { userId: "user_victim" }, sessionUserId: "user_caller" });
    const res = makeRes();
    const nextCalled = run(requireSelf, req, res);
    assert.equal(res._status, 403);
    assert.equal(nextCalled, false);
  });

  test("ATTACK: anonymous caller spoofs userId — must be rejected", () => {
    const req = makeReq({ query: { userId: "user_victim" } });
    const res = makeRes();
    const nextCalled = run(requireSelf, req, res);
    assert.equal(res._status, 401);
    assert.equal(nextCalled, false);
  });
});

describe("requireSelfIfPresent — anonymous-friendly variant", () => {
  test("next() with no userId and no session (true anonymous)", () => {
    const req = makeReq({});
    const res = makeRes();
    const nextCalled = run(requireSelfIfPresent, req, res);
    assert.equal(res._status, undefined);
    assert.equal(nextCalled, true);
  });

  test("next() with no userId but valid session", () => {
    const req = makeReq({ sessionUserId: "user_caller" });
    const res = makeRes();
    assert.equal(run(requireSelfIfPresent, req, res), true);
  });

  test("401 when anonymous caller spoofs userId", () => {
    const req = makeReq({ query: { userId: "user_victim" } });
    const res = makeRes();
    const nextCalled = run(requireSelfIfPresent, req, res);
    assert.equal(res._status, 401);
    assert.equal(nextCalled, false);
  });

  test("403 when authed caller passes someone else's userId", () => {
    const req = makeReq({ query: { userId: "user_victim" }, sessionUserId: "user_caller" });
    const res = makeRes();
    const nextCalled = run(requireSelfIfPresent, req, res);
    assert.equal(res._status, 403);
    assert.equal(nextCalled, false);
  });

  test("next() when authed caller passes their own userId", () => {
    const req = makeReq({ query: { userId: "user_caller" }, sessionUserId: "user_caller" });
    const res = makeRes();
    assert.equal(run(requireSelfIfPresent, req, res), true);
  });
});
