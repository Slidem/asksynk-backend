import { Actor, ownerUserIdOf } from "@/api/kernel/actor/actor";

describe("ownerUserIdOf", () => {
  it("returns the user's own id for a user", () => {
    const actor: Actor = { kind: "user", userId: "u1", email: "u1@x.io" };
    expect(ownerUserIdOf(actor)).toBe("u1");
  });

  it("returns the public view owner's id for a guest", () => {
    const actor: Actor = {
      kind: "guest",
      guestId: "g1",
      publicViewId: "pv1",
      ownerUserId: "owner1",
      displayName: "Guest",
      expiresAt: new Date(),
    };
    expect(ownerUserIdOf(actor)).toBe("owner1");
  });
});
