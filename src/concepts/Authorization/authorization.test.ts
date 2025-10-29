import AuthorizationConcept from "./AuthorizationConcept.ts";

type Doc = Record<string, unknown>;
type UnknownMinimalDb = {
  collection: (name: string) => {
    createIndex: (index: unknown, options?: unknown) => Promise<unknown>;
    findOne: (query: unknown) => Promise<unknown>;
    insertOne: (doc: unknown) => Promise<unknown>;
    updateOne: (query: unknown, update: unknown) => Promise<unknown>;
  };
};

class InMemoryCollection {
  #docs: Doc[] = [];
  createIndex(_index: unknown, _options?: unknown): Promise<void> {
    return Promise.resolve();
  }
  findOne(query: Doc): Promise<Doc | null> {
    return Promise.resolve(
      this.#docs.find((d) => matchQuery(d, query)) ?? null,
    );
  }
  insertOne(doc: Doc): Promise<void> {
    this.#docs.push(structuredClone(doc));
    return Promise.resolve();
  }
  updateOne(
    query: Doc,
    update: { $set?: Record<string, unknown> },
  ): Promise<void> {
    const idx = this.#docs.findIndex((d) => matchQuery(d, query));
    if (idx !== -1) {
      const $set = update?.$set ?? {};
      this.#docs[idx] = { ...this.#docs[idx], ...$set };
    }
    return Promise.resolve();
  }
  reset() {
    this.#docs = [];
  }
  all(): Doc[] {
    return this.#docs.map((d) => ({ ...d }));
  }
}

class InMemoryDb {
  #cols = new Map<string, InMemoryCollection>();
  collection(name: string) {
    if (!this.#cols.has(name)) this.#cols.set(name, new InMemoryCollection());
    return this.#cols.get(name)!;
  }
  reset() {
    for (const c of this.#cols.values()) c.reset();
  }
}

function matchQuery(doc: Doc, query: Doc): boolean {
  // shallow equality for fields in query, no operators besides direct equality
  for (const [k, v] of Object.entries(query)) {
    if ((doc as Record<string, unknown>)[k] !== v) return false;
  }
  return true;
}

// Minimal assert helpers to avoid external imports
function assert(cond: unknown, msg?: string): asserts cond {
  if (!cond) throw new Error(msg ?? "Assertion failed");
}
function assertEquals(a: unknown, b: unknown, msg?: string) {
  if (Number.isNaN(a) && Number.isNaN(b)) return; // treat NaN equal
  if (Object.is(a, b)) return;
  throw new Error(msg ?? `Assertion failed: ${String(a)} !== ${String(b)}`);
}
async function assertRejects(
  fn: () => Promise<unknown>,
  _Err?: unknown,
  msgIncludes?: string,
) {
  let threw = false;
  try {
    await fn();
  } catch (e) {
    threw = true;
    if (
      msgIncludes && !(e instanceof Error && e.message.includes(msgIncludes))
    ) {
      throw new Error(
        `Expected error message to include '${msgIncludes}', got '${
          e instanceof Error ? e.message : e
        }'`,
      );
    }
  }
  if (!threw) throw new Error("Expected promise to reject");
}

Deno.test("AuthorizationConcept Test Suite", async (t) => {
  const db = new InMemoryDb();
  const auth = new AuthorizationConcept(db as unknown as UnknownMinimalDb);

  // Helper to reset state between steps
  const beforeEachStep = () => {
    db.reset();
  };

  await t.step("register", async (t) => {
    await t.step(
      "successfully registers a new user and creates profile",
      async () => {
        await beforeEachStep();
        const res = await auth.register({
          kerb: "campierce",
          email: "campierce@example.com",
          first: "Camila",
          last: "Pierce",
          password: "secret123",
        });
        assertEquals(res.created, true);
        assertEquals(res.kerb, "campierce");

        const logins = db.collection("userLogins").all();
        assertEquals(logins.length, 1);
        assertEquals(logins[0].kerb, "campierce");

        const users = db.collection("users").all();
        assertEquals(users.length, 1);
        assertEquals(users[0].kerb, "campierce");
        assertEquals(users[0].role, "resident");
      },
    );

    await t.step("duplicate kerb is rejected", async () => {
      await beforeEachStep();
      await auth.register({
        kerb: "user1",
        email: "user1@example.com",
        first: "U",
        last: "One",
        password: "secret123",
      });
      await assertRejects(
        () =>
          auth.register({
            kerb: "user1",
            email: "user1@example.com",
            first: "U",
            last: "One",
            password: "secret123",
          }),
        Error,
        "already exists",
      );
    });

    await t.step("rejects non-alphanumeric kerb", async () => {
      await beforeEachStep();
      await assertRejects(
        () =>
          auth.register({
            kerb: "bad_kerb", // underscore not allowed
            email: "bad_kerb@example.com",
            first: "Bad",
            last: "Kerb",
            password: "secret123",
          }),
        Error,
        "alphanumeric",
      );
    });

    await t.step("rejects invalid email format", async () => {
      await beforeEachStep();
      await assertRejects(
        () =>
          auth.register({
            kerb: "foo",
            email: "foo", // missing @
            first: "F",
            last: "O",
            password: "secret123",
          }),
        Error,
        "Invalid email",
      );
    });

    await t.step("rejects when kerb does not match email prefix", async () => {
      await beforeEachStep();
      await assertRejects(
        () =>
          auth.register({
            kerb: "foo",
            email: "bar@example.com",
            first: "Foo",
            last: "Bar",
            password: "secret123",
          }),
        Error,
        "prefix",
      );
    });

    await t.step("registers user with role and promotes them", async () => {
      await beforeEachStep();
      // First create a permission flag
      db.collection("Roles.permissionFlags").insertOne({
        _id: "Admin",
        name: "Admin",
        actions: ["inventory.manage", "roles.manage"],
      });

      const res = await auth.register({
        kerb: "adminuser",
        email: "adminuser@example.com",
        first: "Admin",
        last: "User",
        password: "secret123",
        role: "Admin",
      });

      assertEquals(res.created, true);
      assertEquals(res.kerb, "adminuser");

      // Verify user was created
      const users = db.collection("users").all();
      const adminUser = users.find((u: Doc) => u.kerb === "adminuser");
      assert(adminUser, "Admin user should be created");

      // Verify user was promoted to Admin role
      const userRoles = db.collection("Roles.userRoles").all();
      assertEquals(userRoles.length, 1, "Should have 1 user role entry");
      assertEquals(userRoles[0]._id, adminUser._id);
      assert(Array.isArray(userRoles[0].permissionFlags));
      assertEquals(userRoles[0].permissionFlags.length, 1);
      assertEquals(userRoles[0].permissionFlags[0], "Admin");
    });

    await t.step("registers user even if role doesn't exist", async () => {
      await beforeEachStep();
      // Don't create the permission flag - registration should still succeed
      const res = await auth.register({
        kerb: "testuser",
        email: "testuser@example.com",
        first: "Test",
        last: "User",
        password: "secret123",
        role: "NonExistentRole",
      });

      assertEquals(res.created, true);
      assertEquals(res.kerb, "testuser");

      // Verify user was created but not promoted
      const users = db.collection("users").all();
      assertEquals(users.length, 1);

      const userRoles = db.collection("Roles.userRoles").all();
      assertEquals(userRoles.length, 0); // No role assignment
    });
  });

  await t.step("login", async (t) => {
    await t.step("login succeeds and issues token", async () => {
      await beforeEachStep();
      await auth.register({
        kerb: "jdoe",
        email: "jdoe@example.com",
        first: "John",
        last: "Doe",
        password: "pwd12345",
      });
      const res = await auth.login({ kerb: "jdoe", password: "pwd12345" });
      assertEquals(res.success, true);
      assertEquals(res.kerb, "jdoe");
      assert(typeof res.token === "string" && res.token.length > 0);

      const rec = await db.collection("userLogins").findOne({ kerb: "jdoe" });
      assert(
        !!rec && typeof (rec as Record<string, unknown>).lastToken === "string",
      );
    });

    await t.step("invalid password is rejected", async () => {
      await beforeEachStep();
      await auth.register({
        kerb: "jane",
        email: "jane@example.com",
        first: "Jane",
        last: "Smith",
        password: "goodpass",
      });
      await assertRejects(
        () => auth.login({ kerb: "jane", password: "wrongpass" }),
        Error,
        "Invalid credentials",
      );
    });
  });

  await t.step("validateToken and logout", async (t) => {
    await t.step(
      "validateToken returns true, then logout invalidates",
      async () => {
        await beforeEachStep();
        await auth.register({
          kerb: "alice",
          email: "alice@example.com",
          first: "Alice",
          last: "A",
          password: "strongpass",
        });
        const { token } = await auth.login({
          kerb: "alice",
          password: "strongpass",
        });

        const valid1 = await auth.validateToken({ kerb: "alice", token });
        assertEquals(valid1.valid, true);

        const out = await auth.logout({ kerb: "alice", token });
        assertEquals(out.invalidated, true);

        const valid2 = await auth.validateToken({ kerb: "alice", token });
        assertEquals(valid2.valid, false);
      },
    );

    await t.step("token TTL expires after 24h", async () => {
      await beforeEachStep();
      await auth.register({
        kerb: "tim",
        email: "tim@example.com",
        first: "Tim",
        last: "Time",
        password: "clockwork",
      });
      const { token } = await auth.login({
        kerb: "tim",
        password: "clockwork",
      });

      // Sanity: initially valid
      const v1 = await auth.validateToken({ kerb: "tim", token });
      assertEquals(v1.valid, true);

      // Set lastTokenAt to older than 24h
      const old = new Date(Date.now() - 25 * 60 * 60 * 1000);
      await db.collection("userLogins").updateOne({ kerb: "tim" }, {
        $set: { lastTokenAt: old },
      });

      const v2 = await auth.validateToken({ kerb: "tim", token });
      assertEquals(v2.valid, false);
    });
  });
});
