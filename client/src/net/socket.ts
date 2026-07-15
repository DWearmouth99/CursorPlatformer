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

/** Prefer VITE_WS_URL (split deploy); otherwise same-origin / localhost helper. */
export function clientWsUrl(): string {
  const fromEnv = import.meta.env.VITE_WS_URL;
  if (typeof fromEnv === "string" && fromEnv.trim()) {
    return fromEnv.trim();
  }
  return resolveWsUrl();
}

/**
 * Manual connect — call connect() after the player hits Play.
 * Retries until close() so Render cold-starts can wake up.
 */
export function createGameSocket(handlers: NetHandlers, url = clientWsUrl()) {
  let ws: WebSocket | null = null;
  let closed = false;
  let reconnect = true;

  function connect() {
    if (closed) return;
    if (
      ws &&
      (ws.readyState === WebSocket.OPEN ||
        ws.readyState === WebSocket.CONNECTING)
    ) {
      return;
    }
    const target = url || clientWsUrl();
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
        setTimeout(connect, 1500);
      }
    });

    ws.addEventListener("error", () => {
      ws?.close();
    });
  }

  return {
    connect,
    url,
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
