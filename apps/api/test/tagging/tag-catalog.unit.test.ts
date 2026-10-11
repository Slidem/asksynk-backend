import { UUID,uuidv7 } from "uuidv7";

import { ConnectionPolicyPort } from "@/api/networks/contract/connection-policy.port";
import { EventsPublisher } from "@/api/platform/events/publisher/events-publisher";
import { TagRepository } from "@/api/tagging/domain/ports/tag.repository";
import { AnswerMode, Tag } from "@/api/tagging/domain/tag";
import { TagsService } from "@/api/tagging/services/tags.service";

class FakeTagRepository extends TagRepository {
  constructor(private readonly tags: Tag[]) {
    super();
  }
  async getByIds(ids: string[]): Promise<Tag[]> {
    return this.tags.filter((t) => ids.includes(t.id.toString()));
  }
  add = notUsed;
  update = notUsed;
  delete = notUsed;
  getById = notUsed;
  listByUserIdWithFilters = notUsed;
}

function notUsed(): never {
  throw new Error("not used");
}

const makeTag = (userId: string, answerMode: AnswerMode): Tag =>
  Tag.create({
    id: UUID.parse(uuidv7()),
    userId,
    name: "t",
    color: "#000000",
    answerMode,
    notificationsSettings: {
      browserNotificationEnabled: true,
      soundNotificationEnabled: true,
    },
    createdAt: new Date(),
    updatedAt: new Date(),
  });

describe("TagsService as TagCatalogPort", () => {
  const immediate = makeTag("u1", {
    type: "immediately",
    responseTimeMillis: 60_000,
  });
  const timeblock = makeTag("u1", { type: "timeblock" });
  const foreign = makeTag("u2", { type: "timeblock" });
  const catalog = new TagsService(
    new FakeTagRepository([immediate, timeblock, foreign]),
    {} as EventsPublisher,
    {} as ConnectionPolicyPort,
  );
  const id = (t: Tag) => t.id.toString();

  describe("assertOwnedBy", () => {
    it("passes for no tags", async () => {
      await expect(catalog.assertOwnedBy("u1", [])).resolves.toBeUndefined();
    });

    it("passes when every tag belongs to the user", async () => {
      await expect(
        catalog.assertOwnedBy("u1", [id(immediate), id(timeblock)]),
      ).resolves.toBeUndefined();
    });

    it("rejects a foreign tag", async () => {
      await expect(
        catalog.assertOwnedBy("u1", [id(immediate), id(foreign)]),
      ).rejects.toMatchObject({ code: "tags.tags_not_found" });
    });

    it("rejects a missing tag", async () => {
      await expect(
        catalog.assertOwnedBy("u1", [uuidv7()]),
      ).rejects.toMatchObject({ code: "tags.tags_not_found" });
    });
  });

  describe("getAnswerModes", () => {
    it("maps each found tag to its spec and skips missing ids", async () => {
      const specs = await catalog.getAnswerModes([
        id(immediate),
        id(timeblock),
        uuidv7(),
      ]);
      expect(specs).toEqual([
        {
          tagId: id(immediate),
          type: "immediately",
          responseTimeMillis: 60_000,
        },
        { tagId: id(timeblock), type: "timeblock" },
      ]);
    });
  });
});
