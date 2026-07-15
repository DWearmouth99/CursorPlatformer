import {
  resolveWsUrl,
  parseServerMsg,
  type ClientMsg,
  type ServerMsg,
} from "@fps/shared";

export type NetHandlers = {
  onOpen?: () => void;
  onClose?: () => void;
  onMessage: (msg: ServerMsg) => void;
};

/**
 * Manual connect — call connect() after the player hits Play.
 * Auto-reconnect only after a successful join (enableReconnect).
 */
export function createGameSocket(handlers: NetHandlers, url = resolveWsUrl()) {
  let ws: WebSocket | null = null;
  let closed = false;
  let reconnect = false;

  function connect() {
    if (closed) return;
    if (
      ws &&
      (ws.readyState === WebSocket.OPEN ||
        ws.readyState === WebSocket.CONNECTING)
    ) {
      return;
    }
    const target = url || resolveWsUrl();
    console.log(`[net] connecting ${target}`);
    ws = new WebSocket(target);

    ws.addEventListener("open", () => {
      handlers.onOpen?.();
    });

    ws.addEventListener("message", (ev) => {
      const msg = parseServerMsg(String(ev.data));
      if (msg) handlers.onMessage(msg);
    });

    ws.addEventListener("close", () => {
      handlers.onClose?.();
      if (!closed && reconnect) {
        setTimeout(connect, 1200);
      }
    });

    ws.addEventListener("error", () => {
      ws?.close();
    });
  }

  return {
    connect,
    enableReconnect() {
      reconnect = true;
    },
    send(msg: ClientMsg) {
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(msg));
      }
    },
    close() {
      closed = true;
      reconnect = false;
      ws?.close();
    },
    isOpen() {
      return ws?.readyState === WebSocket.OPEN;
    },
  };
}
