import { Module } from "@nestjs/common";

import { EmailService } from "./email.service";
import { emailProviderFactory } from "./providers/email.provider.factory";

@Module({
  providers: [emailProviderFactory, EmailService],
  exports: [EmailService],
})
export class EmailModule {}
