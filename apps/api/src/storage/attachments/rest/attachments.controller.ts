import { Body, Controller, Get, Param, Patch, Post } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";

import { AuthUser as AuthUserType } from "@/api/auth/auth.types";
import { AuthUser } from "@/api/auth/authUser.decorator";
import { ApiStandardErrors } from "@/api/common/errors/api-error-responses.decorator";
import {
  toAttachmentResponse,
  toUploadResponse,
} from "@/api/storage/attachments/rest/attachments.mapper";
import { CreateAttachmentDto } from "@/api/storage/attachments/rest/dto/create-attachment.dto";
import { FinalizeAttachmentDto } from "@/api/storage/attachments/rest/dto/finalize-attachment.dto";
import {
  AttachmentResponseDto,
  AttachmentUploadResponseDto,
} from "@/api/storage/attachments/rest/responses/attachment.response";
import { AttachmentsService } from "@/api/storage/attachments/services/attachments.service";

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
