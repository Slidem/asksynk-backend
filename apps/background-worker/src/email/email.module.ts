import { EmailSender } from "@/worker/email/email.sender";
import { Module } from "@nestjs/common";

@Module({
  providers: [EmailSender],
  exports: [EmailSender],
})
export class EmailModule {}
