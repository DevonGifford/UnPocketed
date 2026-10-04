import { TimeoutError, withTimeout } from "./with-timeout";

describe("withTimeout", () => {
  it("passes a value through when the promise settles in time", async () => {
    await expect(withTimeout(Promise.resolve("ok"), 50, "task")).resolves.toBe("ok");
  });

  it("passes a rejection through unchanged", async () => {
    const boom = new Error("boom");
    await expect(withTimeout(Promise.reject(boom), 50, "task")).rejects.toBe(boom);
  });

  it("rejects with a TimeoutError once the deadline passes", async () => {
    const never = new Promise<void>(() => {});
    await expect(withTimeout(never, 10, "Preparing the recorder")).rejects.toThrow(
      TimeoutError,
    );
  });

  it("names the operation in the error, so the caller can explain it", async () => {
    const never = new Promise<void>(() => {});
    await expect(
      withTimeout(never, 10, "Preparing the recorder"),
    ).rejects.toMatchObject({ label: "Preparing the recorder" });
  });

  it("does not leave a pending timer behind when the promise wins", async () => {
    jest.useFakeTimers();
    const clearSpy = jest.spyOn(global, "clearTimeout");
    try {
      await withTimeout(Promise.resolve(1), 10_000, "task");
      expect(clearSpy).toHaveBeenCalled();
    } finally {
      clearSpy.mockRestore();
      jest.useRealTimers();
    }
  });
});
