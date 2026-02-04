import { type UIMessageStreamWriter } from "ai";

export function writeTextMessage(
  writer: UIMessageStreamWriter,
  text: string,
  prefix = "msg"
): void {
  const messageId = `${prefix}-${Date.now()}`;
  const textId = `text-${messageId}`;
  writer.write({ type: "start", messageId });
  writer.write({ type: "text-start", id: textId });
  writer.write({ type: "text-delta", id: textId, delta: text });
  writer.write({ type: "text-end", id: textId });
  writer.write({ type: "finish", finishReason: "stop" });
}
