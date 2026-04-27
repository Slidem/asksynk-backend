import { SetMetadata } from "@nestjs/common";

export const ALLOW_GUEST_KEY = "allowGuest";

export const AllowGuest = () => SetMetadata(ALLOW_GUEST_KEY, true);
