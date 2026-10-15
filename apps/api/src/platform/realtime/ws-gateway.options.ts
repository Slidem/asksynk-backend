/**
 * Shared by every @WebSocketGateway: gateways on the same port/namespace share one
 * socket.io server, created with the options of whichever registers first.
 */
export const WS_GATEWAY_OPTIONS = { cors: true };
