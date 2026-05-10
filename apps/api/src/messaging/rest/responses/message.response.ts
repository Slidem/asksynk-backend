export interface MessageResponseDto {
  id: string;
  threadId: string;
  parentMessageId: string | null;
  senderKind: "user" | "guest";
  senderId: string;
  body: string;
  tagIds: string[];
  createdAt: string;
}

export interface ThreadMessageResponseDto extends MessageResponseDto {
  replyCount: number;
}
