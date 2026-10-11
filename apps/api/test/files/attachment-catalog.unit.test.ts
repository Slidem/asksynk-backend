import { AttachmentAccessService } from "@/api/files/application/attachment-access.service";
import { AttachmentsService } from "@/api/files/application/attachments.service";
import { AttachmentPlacement } from "@/api/files/contract/attachment-catalog.port";
import { Attachment } from "@/api/files/domain/attachment";
import { AttachmentStatus } from "@/api/files/domain/attachment.model";
import { AttachmentsRepository } from "@/api/files/domain/ports/attachments.repository";
import { ObjectStorage } from "@/api/files/domain/ports/object-storage";

const makeAttachment = (
  id: string,
  placement: AttachmentPlacement,
  status: AttachmentStatus = "active",
  ownerUserId = "u1",
): Attachment =>
  Attachment.create({
    id,
    ownerUserId,
    placement,
    storageKey: `k/${id}`,
    contentType: "image/png",
    sizeBytes: 1,
    fileName: null,
    status,
    createdAt: new Date(),
  });

describe("AttachmentsService.assertUsable", () => {
  const attachments = [
    makeAttachment("msg", "message"),
    makeAttachment("pub", "public"),
    makeAttachment("pending", "message", "pending"),
    makeAttachment("foreign", "message", "active", "u2"),
  ];
  const repo = {
    getByIds: async (ids: string[]) =>
      attachments.filter((a) => ids.includes(a.id)),
  } as unknown as AttachmentsRepository;
  const catalog = new AttachmentsService(
    repo,
    {} as ObjectStorage,
    {} as AttachmentAccessService,
  );
  const rule = { ownerUserId: "u1", placement: "message" as const };

  it("passes for no ids", async () => {
    await expect(catalog.assertUsable([], rule)).resolves.toBeUndefined();
  });

  it("passes for owned, active attachments of the placement", async () => {
    await expect(catalog.assertUsable(["msg"], rule)).resolves.toBeUndefined();
  });

  it.each([
    ["missing", "nope"],
    ["wrong placement", "pub"],
    ["not finalized", "pending"],
    ["foreign owner", "foreign"],
  ])("rejects %s", async (_, id) => {
    await expect(catalog.assertUsable(["msg", id], rule)).rejects.toMatchObject(
      { code: "storage.attachment_not_usable" },
    );
  });
});
