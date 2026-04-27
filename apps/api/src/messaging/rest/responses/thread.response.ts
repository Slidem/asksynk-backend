export type ThreadOtherParticipantDto =
  | {
      kind: "user";
      userId: string;
      name: string | null;
      firstName: string | null;
      lastName: string | null;
      email: string;
      image: string | null;
      isActiveConnection: boolean;
    }
  | {
      kind: "guest";
      guestId: string;
      displayName: string;
      publicViewId: string;
      publicViewName: string | null;
      publicViewExpired: boolean;
    };

export interface ThreadListItemResponseDto {
  threadId: string;
  publicViewId: string | null;
  other: ThreadOtherParticipantDto;
  lastMessage: {
    body: string;
    createdAt: string;
    senderKind: "user" | "guest";
  } | null;
  frozen: boolean;
  createdAt: string;
}

export interface CreateThreadResponseDto {
  threadId: string;
}
