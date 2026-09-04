import { Module } from "@nestjs/common";

import { EmailService } from "@/api/platform/email/email.service";
import { emailProviderFactory } from "@/api/platform/email/providers/email.provider.factory";

@Module({
  providers: [emailProviderFactory, EmailService],
  exports: [EmailService],
})
export class EmailModule {}
