import { beforeEach, describe, expect, it } from "vitest";
import { toast, useToastStore } from "@/stores/toasts";

describe("toast store", () => {
  beforeEach(() => {
    useToastStore.setState({ toasts: [] });
  });

  it("pushes toasts with kind/title/description", () => {
    toast.error("Action failed", "boom");
    const t = useToastStore.getState().toasts;
    expect(t).toHaveLength(1);
    expect(t[0]).toMatchObject({ kind: "error", title: "Action failed", description: "boom" });
  });

  it("dedups identical kind+title+description", () => {
    toast.error("Loading failed", "ECONNREFUSED");
    toast.error("Loading failed", "ECONNREFUSED");
    toast.error("Loading failed", "other message");
    expect(useToastStore.getState().toasts).toHaveLength(2);
  });

  it("caps the visible stack at 5", () => {
    for (let i = 0; i < 8; i++) toast.info(`t${i}`);
    const t = useToastStore.getState().toasts;
    expect(t).toHaveLength(5);
    expect(t[t.length - 1].title).toBe("t7");
  });

  it("dismiss removes by id", () => {
    toast.success("done");
    const id = useToastStore.getState().toasts[0].id;
    useToastStore.getState().dismiss(id);
    expect(useToastStore.getState().toasts).toHaveLength(0);
  });
});
