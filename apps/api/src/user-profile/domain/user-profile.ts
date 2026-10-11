export interface UserProfileProps {
  id: string;
  name: string | null;
  firstName: string | null;
  lastName: string | null;
  email: string;
  image: string | null;
  phone: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export class UserProfile {
  readonly id: string;
  readonly name: string | null;
  readonly firstName: string | null;
  readonly lastName: string | null;
  readonly email: string;
  image: string | null;
  phone: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;

  private constructor(props: UserProfileProps) {
    this.id = props.id;
    this.name = props.name;
    this.firstName = props.firstName;
    this.lastName = props.lastName;
    this.email = props.email;
    this.image = props.image;
    this.phone = props.phone;
    this.createdAt = props.createdAt;
    this.updatedAt = props.updatedAt;
  }

  static create(props: UserProfileProps): UserProfile {
    return new UserProfile(props);
  }
}
