export interface ThreadProps {
  id: string;
  publicViewId: string | null;
  createdAt: Date;
}

export class Thread {
  readonly id: string;
  readonly publicViewId: string | null;
  readonly createdAt: Date;

  private constructor(props: ThreadProps) {
    this.id = props.id;
    this.publicViewId = props.publicViewId;
    this.createdAt = props.createdAt;
  }

  static create(props: ThreadProps): Thread {
    return new Thread(props);
  }

  isGuestThread(): boolean {
    return this.publicViewId !== null;
  }
}
