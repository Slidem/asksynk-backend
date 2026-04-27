export type InviteStatus = "pending" | "accepted" | "rejected";

export interface InviteProps {
  id: string;
  inviterUserId: string;
  inviteeEmail: string;
  status: InviteStatus;
  createdAt: Date;
  updatedAt: Date;
}

export class Invite {
  readonly id: string;
  readonly inviterUserId: string;
  readonly inviteeEmail: string;
  status: InviteStatus;
  readonly createdAt: Date;
  updatedAt: Date;

  private constructor(props: InviteProps) {
    this.id = props.id;
    this.inviterUserId = props.inviterUserId;
    this.inviteeEmail = props.inviteeEmail;
    this.status = props.status;
    this.createdAt = props.createdAt;
    this.updatedAt = props.updatedAt;
  }

  static create(props: InviteProps): Invite {
    return new Invite(props);
  }

  isForEmail(email: string): boolean {
    return this.inviteeEmail.toLowerCase() === email.toLowerCase();
  }

  isPending(): boolean {
    return this.status === "pending";
  }
}
