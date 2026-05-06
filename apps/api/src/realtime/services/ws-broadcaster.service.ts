import { Injectable } from "@nestjs/common";
import { Server } from "socket.io";

@Injectable()
export class WsBroadcaster {
  private server!: Server;

  setServer(s: Server) {
    this.server = s;
  }
  emit(rooms: string[], event: string, data: unknown) {
    this.server.to(rooms).emit(event, data);
  }
}
