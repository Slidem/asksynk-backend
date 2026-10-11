import { AnswerModeType, Tag } from "@/api/tagging/domain/tag";

export interface ListTagsFilters {
  answerMode?: AnswerModeType;
  orderBy?: "createdAt" | "updatedAt";
  orderDirection?: "asc" | "desc";
  search?: string;
  limit?: number;
  offset?: number;
}

export abstract class TagRepository {
  abstract add(tag: Tag): Promise<Tag>;
  abstract update(tag: Tag): Promise<Tag>;
  abstract delete(tagId: string): Promise<Tag>;
  abstract getById(id: string): Promise<Tag | null>;
  abstract getByIds(ids: string[]): Promise<Tag[]>;
  abstract listByUserIdWithFilters(
    userId: string,
    filters: ListTagsFilters,
  ): Promise<Tag[]>;
}
