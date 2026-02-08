const request = require("supertest");

const { createApp } = require("../index");

function makeSupabaseMock(state) {
  return {
    auth: {
      getUser: async (token) => {
        if (token !== "good") return { data: { user: null }, error: new Error("bad") };
        return { data: { user: { id: "teacher-1", email: "t@example.com" } }, error: null };
      },
    },
    from: (table) => {
      const ctx = {
        _table: table,
        _select: null,
        _filters: [],
        _update: null,
        _insert: null,
        _single: false,
        select(sel) {
          this._select = sel;
          return this;
        },
        eq(col, val) {
          this._filters.push([col, val]);
          return this;
        },
        maybeSingle() {
          return this._resolveMaybeSingle();
        },
        single() {
          this._single = true;
          return this._resolveSingle();
        },
        update(values) {
          this._update = values;
          return this;
        },
        insert(values) {
          this._insert = values;
          return this;
        },
        async _resolveMaybeSingle() {
          return this._resolve(false);
        },
        async _resolveSingle() {
          return this._resolve(true);
        },
        async _resolve(requireRow) {
          const teacherId = this._filters.find((f) => f[0] === "teacher_id")?.[1];
          if (teacherId && teacherId !== "teacher-1") {
            return { data: null, error: null };
          }

          if (table === "sync_dedupe") {
            const opId = this._filters.find((f) => f[0] === "op_id")?.[1];
            if (this._insert) {
              const id = this._insert.op_id;
              if (state.dedupe.has(id)) {
                return { data: null, error: { code: "23505", message: "duplicate key value violates unique constraint" } };
              }
              state.dedupe.add(id);
              return { data: { op_id: id }, error: null };
            }
            const exists = opId && state.dedupe.has(opId);
            return { data: exists ? { op_id: opId } : null, error: null };
          }

          if (table === "students") {
            if (this._insert) {
              const created = {
                id: ++state.studentSeq,
                updated_at: state.now(),
                is_deleted: false,
              };
              state.studentsByRoll.set(this._insert.roll_no, created);
              return { data: created, error: null };
            }

            if (this._update) {
              const id = this._filters.find((f) => f[0] === "id")?.[1];
              const roll = this._filters.find((f) => f[0] === "roll_no")?.[1];
              const existing =
                id != null
                  ? [...state.studentsByRoll.values()].find((s) => s.id === id)
                  : state.studentsByRoll.get(roll);
              if (!existing) return { data: null, error: null };
              const updated = { ...existing, ...this._update, updated_at: state.now() };
              state.studentsByRoll.set(roll ?? existing.roll_no, updated);
              return { data: updated, error: null };
            }

            const id = this._filters.find((f) => f[0] === "id")?.[1];
            const roll = this._filters.find((f) => f[0] === "roll_no")?.[1];
            const existing =
              id != null
                ? [...state.studentsByRoll.values()].find((s) => s.id === id)
                : state.studentsByRoll.get(roll);
            return { data: existing ?? null, error: null };
          }

          if (table === "attendance") {
            const key = `${this._filters.find((f) => f[0] === "student_id")?.[1]}|${this._filters.find((f) => f[0] === "date")?.[1]}`;
            if (this._insert) {
              const created = { id: ++state.attSeq, updated_at: state.now() };
              state.attByKey.set(key, created);
              return { data: created, error: null };
            }
            if (this._update) {
              const existing = state.attByKey.get(key);
              if (!existing) return { data: null, error: null };
              const updated = { ...existing, ...this._update, updated_at: state.now() };
              state.attByKey.set(key, updated);
              return { data: updated, error: null };
            }
            return { data: state.attByKey.get(key) ?? null, error: null };
          }

          return { data: null, error: null };
        },
      };

      return ctx;
    },
  };
}

describe("POST /sync", () => {
  test("LWW rejects stale update", async () => {
    const state = {
      studentSeq: 100,
      attSeq: 0,
      dedupe: new Set(),
      studentsByRoll: new Map([[1, { id: 1, updated_at: "2026-02-08T10:00:00.000Z", is_deleted: false, roll_no: 1 }]]),
      attByKey: new Map(),
      now: () => "2026-02-08T11:00:00.000Z",
    };

    const app = createApp({ supabase: makeSupabaseMock(state) });

    const res = await request(app)
      .post("/sync")
      .set("Authorization", "Bearer good")
      .send({
        operations: [
          {
            op_id: "op-1",
            entity: "student",
            action: "update",
            client_updated_at: "2026-02-08T09:00:00.000Z",
            data: { roll_no: 1, name: "Old" },
          },
        ],
      });

    expect(res.status).toBe(200);
    expect(res.body.applied).toHaveLength(0);
    expect(res.body.rejected).toHaveLength(1);
    expect(res.body.rejected[0].reason).toMatch(/Stale update/);
  });

  test("Soft delete applied when newer", async () => {
    const state = {
      studentSeq: 1,
      attSeq: 0,
      dedupe: new Set(),
      studentsByRoll: new Map([[1, { id: 1, updated_at: "2026-02-08T10:00:00.000Z", is_deleted: false, roll_no: 1 }]]),
      attByKey: new Map(),
      now: () => "2026-02-08T11:00:00.000Z",
    };

    const app = createApp({ supabase: makeSupabaseMock(state) });

    const res = await request(app)
      .post("/sync")
      .set("Authorization", "Bearer good")
      .send({
        operations: [
          {
            op_id: "op-2",
            entity: "student",
            action: "delete",
            client_updated_at: "2026-02-08T10:30:00.000Z",
            data: { roll_no: 1 },
          },
        ],
      });

    expect(res.status).toBe(200);
    expect(res.body.applied).toHaveLength(1);
  });

  test("Idempotent replay becomes stale", async () => {
    const state = {
      studentSeq: 1,
      attSeq: 0,
      dedupe: new Set(),
      studentsByRoll: new Map(),
      attByKey: new Map(),
      now: () => "2026-02-08T11:00:00.000Z",
    };

    const app = createApp({ supabase: makeSupabaseMock(state) });

    const op = {
      op_id: "op-3",
      entity: "student",
      action: "create",
      client_updated_at: "2026-02-08T10:30:00.000Z",
      data: { roll_no: 5, name: "A" },
    };

    const first = await request(app).post("/sync").set("Authorization", "Bearer good").send({ operations: [op] });
    expect(first.status).toBe(200);
    expect(first.body.applied).toHaveLength(1);

    const second = await request(app).post("/sync").set("Authorization", "Bearer good").send({ operations: [op] });
    expect(second.status).toBe(200);
    expect(Array.isArray(second.body.skipped) ? second.body.skipped.length : 0).toBe(1);
  });
});
