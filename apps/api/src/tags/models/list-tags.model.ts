import { AnswerModeType } from "@/api/tags/models/tag.model";

export type TagOrderBy = "createdAt" | "updatedAt";

export type TagOrderDirection = "asc" | "desc";

export interface ListTagsInput {
  answerMode?: AnswerModeType;
  orderBy?: TagOrderBy;
  orderDirection?: TagOrderDirection;
  search?: string;
  limit?: number;
  offset?: number;
}
