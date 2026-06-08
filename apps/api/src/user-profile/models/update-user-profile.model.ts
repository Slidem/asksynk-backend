export interface UpdateUserProfileInput {
  userId: string;
  // null clears the field; undefined leaves it untouched.
  phone?: string | null;
  avatarAttachmentId?: string | null;
}
