import { Module } from "@nestjs/common";
import { UsersRepository } from "@/api/repository/users.repository";
import { UsersService } from "@/api/services/users.service";

@Module({
  providers: [UsersRepository, UsersService],
  exports: [UsersService],
})
export class UsersModule {}
