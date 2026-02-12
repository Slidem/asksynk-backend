import { TagDto } from "@/api/dtos/tagDto";
import { CreateTagRequestDto } from "@/api/dtos/tagRequestsDto";
import { TagsService } from "@/api/services/tags.service";
import { Body, Controller, Get, Post, Put } from "@nestjs/common";
import { AuthUser } from "@/api/auth/authUser.decorator";
import { AuthUser as AuthUserType } from "@/api/auth/auth.types";

@Controller("tags")
export class TagsController {
  constructor(private readonly tagsService: TagsService) {}

  @Post()
  createTag(
    @Body() createTag: CreateTagRequestDto,
    @AuthUser() user: AuthUserType,
  ): Promise<TagDto> {
    return this.tagsService.createTag({ ...createTag, userId: user.id });
  }

  @Get()
  listTagsByUserId(@AuthUser() user: AuthUserType): Promise<TagDto[]> {
    return this.tagsService.listTagsByUserId(user.id);
  }

  @Put()
  putTag(
    @Body() putTag: CreateTagRequestDto,
    @AuthUser() user: AuthUserType,
  ): Promise<TagDto> {
    return this.tagsService.putTag({ ...putTag, userId: user.id });
  }
}
