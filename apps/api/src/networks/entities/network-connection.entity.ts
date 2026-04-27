export interface NetworkConnectionProps {
  userId: string;
  connectionId: string;
  name: string | null;
  firstName: string | null;
  lastName: string | null;
  email: string;
  image: string | null;
  connectedAt: Date;
}

export class NetworkConnection {
  readonly userId: string;
  readonly connectionId: string;
  readonly name: string | null;
  readonly firstName: string | null;
  readonly lastName: string | null;
  readonly email: string;
  readonly image: string | null;
  readonly connectedAt: Date;

  private constructor(props: NetworkConnectionProps) {
    this.userId = props.userId;
    this.connectionId = props.connectionId;
    this.name = props.name;
    this.firstName = props.firstName;
    this.lastName = props.lastName;
    this.email = props.email;
    this.image = props.image;
    this.connectedAt = props.connectedAt;
  }

  static create(props: NetworkConnectionProps): NetworkConnection {
    return new NetworkConnection(props);
  }
}
