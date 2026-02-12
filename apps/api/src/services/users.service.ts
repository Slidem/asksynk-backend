import { Injectable } from "@nestjs/common";
import { Transactional } from "@nestjs-cls/transactional";
import { UsersRepository } from "@/api/repository/users.repository";

type AuthUserInput = {
  id: string;
  firstName?: string;
  lastName?: string;
  email?: string;
};

@Injectable()
export class UsersService {
  constructor(private readonly usersRepository: UsersRepository) {}

  @Transactional()
  async upsertUserFromAuth(user: AuthUserInput): Promise<void> {
    const existing = await this.usersRepository.getById(user.id);
    if (!existing) {
      await this.usersRepository.createUser({
        id: user.id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        address: null,
      });
      return;
    }

    const update = {
      firstName: user.firstName ?? existing.firstName,
      lastName: user.lastName ?? existing.lastName,
      email: user.email ?? existing.email,
    };

    await this.usersRepository.updateUser(user.id, update);
  }
}
