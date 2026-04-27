import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Transactional } from "@nestjs-cls/transactional";
import { ContextLogger } from "nestjs-context-logger";

import { AsksynkError } from "@/api/common/errors/errors.model";
import { PublicView } from "@/api/public-views/entities/public-view.entity";
import {
  PUBLIC_VIEW_DEFAULT_TTL_MS,
  PUBLIC_VIEW_MAX_TTL_MS,
  SLUG_INSERT_MAX_RETRIES,
  SLUG_LENGTH,
} from "@/api/public-views/public-views.constants";
import {
  GuestWithStats,
  PublicViewGuestsRepository,
} from "@/api/public-views/repositories/public-view-guests.repository";
import {
  PublicViewsRepository,
  PublicViewWithStats,
} from "@/api/public-views/repositories/public-views.repository";
import { generateSlug } from "@/api/public-views/utils/slug.util";
import { generateId } from "@/shared/id";
import { PgError, PgErrorCode } from "@/shared/pg-error-codes";

@Injectable()
export class PublicViewsService {
  private readonly logger = new ContextLogger(PublicViewsService.name);

  constructor(
    private readonly publicViewsRepository: PublicViewsRepository,
    private readonly guestsRepository: PublicViewGuestsRepository,
    private readonly configService: ConfigService,
  ) {}

  @Transactional()
  async create(
    ownerUserId: string,
    input: { name?: string | null; expiresAt?: Date | null },
  ): Promise<{ view: PublicView; url: string }> {
    const now = new Date();

    let expiresAt = new Date(now.getTime() + PUBLIC_VIEW_DEFAULT_TTL_MS);

    if (input.expiresAt) {
      if (input.expiresAt <= now) {
        throw AsksynkError.badRequest("expiresAt must be in the future");
      }
      if (input.expiresAt.getTime() - now.getTime() > PUBLIC_VIEW_MAX_TTL_MS) {
        throw AsksynkError.badRequest("expiresAt must be within 30 days");
      }
      expiresAt = input.expiresAt;
    }

    for (let attempt = 0; attempt < SLUG_INSERT_MAX_RETRIES; attempt++) {
      const slug = generateSlug(SLUG_LENGTH);
      try {
        const view = await this.publicViewsRepository.insert({
          id: generateId(),
          ownerUserId,
          slug,
          name: input.name ?? null,
          expiresAt,
        });
        return { view, url: this.buildUrl(view.slug) };
      } catch (err) {
        if (!this.isUniqueViolation(err)) throw err;
        this.logger.warn("Slug collision, retrying", { attempt });
      }
    }

    throw AsksynkError.internalServerError(
      "Failed to allocate public view slug",
    );
  }

  async listForOwner(
    ownerUserId: string,
  ): Promise<Array<PublicViewWithStats & { url: string }>> {
    const rows =
      await this.publicViewsRepository.listForOwnerWithStats(ownerUserId);
    return rows.map((r) => ({ ...r, url: this.buildUrl(r.view.slug) }));
  }

  async listGuests(
    ownerUserId: string,
    viewId: string,
  ): Promise<GuestWithStats[]> {
    const view = await this.publicViewsRepository.getById(viewId);
    if (!view || !view.belongsTo(ownerUserId)) {
      throw AsksynkError.notFound("Public view not found");
    }
    return this.guestsRepository.listForViewWithStats(viewId);
  }

  @Transactional()
  async revoke(ownerUserId: string, viewId: string): Promise<PublicView> {
    const revoked = await this.publicViewsRepository.revoke(
      viewId,
      ownerUserId,
    );
    if (!revoked) throw AsksynkError.notFound("Public view not found");
    return revoked;
  }

  buildUrl(slug: string): string {
    const base = this.configService.getOrThrow<string>("APP_BASE_URL");
    return `${base}/public/${slug}`;
  }

  private isUniqueViolation(err: unknown): boolean {
    return (err as PgError)?.code === PgErrorCode.UNIQUE_VIOLATION;
  }
}
