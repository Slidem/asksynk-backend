import { AnswerModeType } from "@/api/tags/models/tag.model";

export const TAG_ORDER_BYS = ["createdAt", "updatedAt"] as const;
export type TagOrderBy = (typeof TAG_ORDER_BYS)[number];

export const TAG_ORDER_DIRECTIONS = ["asc", "desc"] as const;
export type TagOrderDirection = (typeof TAG_ORDER_DIRECTIONS)[number];

export interface ListTagsInput {
  answerMode?: AnswerModeType;
  orderBy?: TagOrderBy;
  orderDirection?: TagOrderDirection;
  search?: string;
  limit?: number;
  offset?: number;
}
