import { syncNow } from "../sync";

jest.mock("@react-native-community/netinfo", () => ({
  fetch: jest.fn(async () => ({ isConnected: true })),
}));

jest.mock("../repo", () => ({
  getQueueBatch: jest.fn(async () => [
    {
      id: 1,
      table_name: "student",
      record_id: "10",
      op_type: "create",
      payload: JSON.stringify({ roll_no: 1, name: "A" }),
      client_updated_at: "2026-02-08T10:00:00.000Z",
      created_at: "2026-02-08T10:00:00.000Z",
      attempts: 0,
    },
  ]),
  incrementQueueAttempts: jest.fn(async () => undefined),
  deleteQueueRows: jest.fn(async () => undefined),
  attachServerIdToStudent: jest.fn(async () => undefined),
  attachServerIdToAttendance: jest.fn(async () => undefined),
}));

jest.mock("../telemetry", () => ({
  emitSyncTelemetry: jest.fn(),
}));

global.fetch = jest.fn(async () => ({
  ok: true,
  json: async () => ({ applied: [{ op_id: "q:1:10", entity: "student", action: "create", id: 99 }], rejected: [], server_time: "2026-02-08T10:01:00.000Z" }),
})) as any;

describe("syncNow", () => {
  it("dequeues on success", async () => {
    const { deleteQueueRows } = require("../repo");
    await syncNow({ accessToken: "token", teacherId: "t1" });
    expect(deleteQueueRows).toHaveBeenCalledWith([1]);
  });

  it("enqueues retry on failure", async () => {
    (global.fetch as any).mockResolvedValueOnce({ ok: false, status: 500 });
    const { incrementQueueAttempts } = require("../repo");
    await syncNow({ accessToken: "token", teacherId: "t1" });
    expect(incrementQueueAttempts).toHaveBeenCalled();
  });
});
