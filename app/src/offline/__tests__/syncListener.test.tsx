import React from "react";
import renderer from "react-test-renderer";

jest.mock("@react-native-community/netinfo", () => ({
  addEventListener: jest.fn((cb: any) => {
    cb({ isConnected: true });
    return () => undefined;
  }),
}));

jest.mock("../../context/AuthContext", () => ({
  useAuth: () => ({ user: { id: "teacher-1" }, accessToken: "token" }),
}));

jest.mock("../sync", () => ({
  syncNow: jest.fn(async () => undefined),
}));

import SyncListener from "../syncListener";

describe("SyncListener", () => {
  it("triggers sync on reconnect", () => {
    const { syncNow } = require("../sync");
    renderer.create(<SyncListener />);
    expect(syncNow).toHaveBeenCalled();
  });
});
