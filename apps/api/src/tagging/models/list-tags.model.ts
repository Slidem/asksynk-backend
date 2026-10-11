import { AnswerModeType } from "@/api/tagging/domain/tag";

export const TAG_ORDER_BYS = ["createdAt", "updatedAt"] as const;
export type TagOrderBy = (typeof TAG_ORDER_BYS)[number];

export const TAG_ORDER_DIRECTIONS = ["asc", "desc"] as const;
export type TagOrderDirection = (typeof TAG_ORDER_DIRECTIONS)[number];

export interface ListTagsInput {
  // whose tags: self when omitted; a connected user's otherwise
  userId?: string;
  answerMode?: AnswerModeType;
  orderBy?: TagOrderBy;
  orderDirection?: TagOrderDirection;
  search?: string;
  limit?: number;
  offset?: number;
}
