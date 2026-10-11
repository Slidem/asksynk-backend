import { Body, Controller, Get, Param, Patch, Post } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";

import { AttachmentsService } from "@/api/files/application/attachments.service";
import {
  toAttachmentResponse,
  toUploadResponse,
} from "@/api/files/presentation/rest/attachments.mapper";
import { CreateAttachmentDto } from "@/api/files/presentation/rest/dto/create-attachment.dto";
import { FinalizeAttachmentDto } from "@/api/files/presentation/rest/dto/finalize-attachment.dto";
import {
  AttachmentResponseDto,
  AttachmentUploadResponseDto,
} from "@/api/files/presentation/rest/responses/attachment.response";
import { ApiStandardErrors } from "@/api/platform/errors/swagger.decorator";
import { AuthUser as AuthUserType } from "@/api/platform/http/auth/auth.types";
import { AuthUser } from "@/api/platform/http/auth/auth-user.decorator";

@ApiTags("Attachments")
@ApiBearerAuth("bearer")
@ApiStandardErrors()
@Controller("attachments")
export class AttachmentsController {
  constructor(private readonly attachmentsService: AttachmentsService) {}

  /** Start an upload: returns a presigned URL + the pending attachment id */
  @Post()
  async create(
    @Body() body: CreateAttachmentDto,
    @AuthUser() user: AuthUserType,
  ): Promise<AttachmentUploadResponseDto> {
    const created = await this.attachmentsService.createUpload(
      { userId: user.id },
      {
        placement: body.placement,
        contentType: body.contentType,
        fileName: body.fileName,
        sizeBytes: body.sizeBytes,
      },
    );
    return toUploadResponse(created);
  }

  /** Finalize an uploaded attachment, marking it ready */
  @Patch(":id")
  async finalize(
    @Param("id") id: string,
    @Body() _body: FinalizeAttachmentDto,
    @AuthUser() user: AuthUserType,
  ): Promise<AttachmentResponseDto> {
    const attachment = await this.attachmentsService.finalize(
      { userId: user.id },
      id,
    );

    return toAttachmentResponse(attachment);
  }

  /** Get an attachment with a fresh readable url */
  @Get(":id")
  async getOne(
    @Param("id") id: string,
    @AuthUser() user: AuthUserType,
  ): Promise<AttachmentResponseDto> {
    const attachment = await this.attachmentsService.getReadable(
      { userId: user.id },
      id,
    );
    return toAttachmentResponse(attachment);
  }
}
