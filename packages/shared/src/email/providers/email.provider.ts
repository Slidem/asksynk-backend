import { RawEmailMessage } from "../email.types";

/**
 * Email transport. Abstract class = interface + DI token (mirrors the `Clock`
 * pattern); the concrete impl is chosen from EMAIL_PROVIDER in EmailModule.
 */
export abstract class EmailProvider {
  /**
   * Sends an email message using the provider's API. The implementation of this method will vary depending on the provider being used.
   *
   * @param message
   */
  abstract sendEmail(message: RawEmailMessage): Promise<void>;
}
