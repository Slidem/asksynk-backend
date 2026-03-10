import { ContextLogger } from "nestjs-context-logger";
import { Injectable } from "@nestjs/common";
import { TransactionHost } from "@nestjs-cls/transactional";
import { TxAdapter } from "@/api/common/db/tx.module";

@Injectable()
export class EventsRepository {
  private readonly logger = new ContextLogger(EventsRepository.name);

  constructor(private readonly txHost: TransactionHost<TxAdapter>) {}
}
