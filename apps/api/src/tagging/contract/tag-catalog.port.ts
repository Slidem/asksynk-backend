export type AnswerModeSpec =
  | { tagId: string; type: "immediately"; responseTimeMillis: number }
  | { tagId: string; type: "timeblock" };

// What other contexts may ask tagging: ownership of tag ids, and each tag's
// answer-mode policy. Nobody outside tagging loads a `Tag`.
export abstract class TagCatalogPort {
  // Throws `tags.tags_not_found` unless every id exists and belongs to `userId`.
  abstract assertOwnedBy(userId: string, tagIds: string[]): Promise<void>;
  // Missing ids are skipped.
  abstract getAnswerModes(tagIds: string[]): Promise<AnswerModeSpec[]>;
}
