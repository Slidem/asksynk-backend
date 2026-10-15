import { Transform, Type } from "class-transformer";
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  ValidateNested,
} from "class-validator";

import { MAX_ATTACHMENTS_PER_MESSAGE } from "@/api/conversations/domain/message-attachment.constants";
import { IsIdList } from "@/api/conversations/presentation/ws/dto/id-list.decorator";

const trim = ({ value }: { value: unknown }) =>
  typeof value === "string" ? value.trim() : value;

class SuggestedTaskDto {
  @IsOptional()
  @Transform(trim)
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  description?: string | null;
}

// Nested messages get the "taskSuggestion." prefix from ValidationPipe.
class TaskSuggestionDto {
  @IsIn(["task", "batch"], { message: "kind must be task|batch" })
  kind!: "task" | "batch";

  @Transform(trim)
  @IsString({ message: "title required" })
  @IsNotEmpty({ message: "title required" })
  title!: string;

  @IsOptional()
  @IsString()
  description?: string | null;

  @IsOptional()
  @IsString()
  dueDate?: string | null;

  @IsIdList("tagIds")
  tagIds?: string[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SuggestedTaskDto)
  tasks?: SuggestedTaskDto[];
}

// Property order = the order errors are reported (first one wins in the ack).
export class SendMessageDto {
  @Transform(trim)
  @IsString({ message: "body required" })
  @IsNotEmpty({ message: "body required" })
  body!: string;

  @IsIdList("tagIds")
  tagIds?: string[];

  // Above @IsIdList on purpose: registers after it, so "must be string[]" wins.
  @ArrayMaxSize(MAX_ATTACHMENTS_PER_MESSAGE, {
    message: `maximum ${MAX_ATTACHMENTS_PER_MESSAGE} attachments allowed`,
  })
  @IsIdList("attachmentIds")
  attachmentIds?: string[];

  @IsOptional()
  @ValidateNested()
  @Type(() => TaskSuggestionDto)
  taskSuggestion?: TaskSuggestionDto | null;

  @IsOptional()
  @IsString()
  threadId?: string;

  @IsOptional()
  @IsString()
  parentMessageId?: string | null;
}
