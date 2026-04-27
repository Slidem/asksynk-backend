export interface MessageResponseDto {
  id: string;
  threadId: string;
  senderKind: "user" | "guest";
  senderId: string;
  body: string;
  createdAt: string;
}
