/**
 * Input validation to detect prompt injection attempts.
 */

const INJECTION_PATTERNS = [
  /ignore\s+(all\s+)?(previous|prior|above|earlier)\s+(instructions?|prompts?|rules?|context)/i,
  /forget\s+(everything|all|your)\s+(previous|prior|instructions?|rules?)/i,
  /disregard\s+(all\s+)?(previous|prior|above|system)/i,
  /override\s+(all\s+)?(previous|prior|system)\s+(instructions?|rules?)/i,
  /you\s+are\s+(now|actually|really)\s+(a|an)\b/i,
  /pretend\s+(to\s+be|you('re|r)?|that\s+you)/i,
  /act\s+(like|as)\s+(if\s+)?(you('re|r)?|a|an)\b/i,
  /roleplay\s+as/i,
  /switch\s+(to|into)\s+.+\s+mode/i,
  /enter\s+.+\s+mode/i,
  /reveal\s+(your\s+)?(system\s+)?prompt/i,
  /show\s+(me\s+)?(your\s+)?(system\s+)?instructions/i,
  /what\s+(are|is)\s+(your\s+)?(system\s+)?(prompt|instructions)/i,
  /repeat\s+(back\s+)?(the\s+)?(system|initial)\s+(prompt|instructions)/i,
  /output\s+(your\s+)?(system\s+)?(prompt|instructions)/i,
  /print\s+(your\s+)?(system\s+)?(prompt|instructions)/i,
  /\bDAN\b/, // "Do Anything Now"
  /\bJAILBREAK/i,
  /developer\s+mode/i,
  /sudo\s+mode/i,
  /god\s+mode/i,
  /unrestricted\s+mode/i,
  /<\/?system>/i,
  /<\/?instructions?>/i,
  /\[INST\]/i,
  /\[\/INST\]/i,
  /<<\s*SYS\s*>>/i,
];

const SUSPICIOUS_PATTERNS = [
  /bypass/i,
  /admin\s+mode/i,
  /debug\s+mode/i,
  /test\s+mode/i,
  /new\s+instructions/i,
  /different\s+rules/i,
];

export interface ValidationResult {
  allowed: boolean;
  reason?: string;
  suspicious: boolean;
}

export function validateInput(userMessage: string): ValidationResult {
  for (const pattern of INJECTION_PATTERNS) {
    if (pattern.test(userMessage)) {
      return {
        allowed: false,
        reason: "How dare you use my own spells against me, Potter?",
        suspicious: true,
      };
    }
  }

  let suspicious = false;
  for (const pattern of SUSPICIOUS_PATTERNS) {
    if (pattern.test(userMessage)) {
      suspicious = true;
      break;
    }
  }

  if (userMessage.length > 5000) {
    return {
      allowed: false,
      reason: "Message too long. Please keep your message under 5000 characters.",
      suspicious: true,
    };
  }

  if (/[\u200B-\u200D\uFEFF\u2060]/.test(userMessage)) {
    suspicious = true;
  }

  return { allowed: true, suspicious };
}

export function getLastUserMessageText(
  messages: Array<{ role: string; content?: unknown; parts?: unknown[] }>
): string | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (msg.role === "user") {
      if (typeof msg.content === "string") {
        return msg.content;
      }
      if (Array.isArray(msg.parts)) {
        const textParts = msg.parts
          .filter(
            (part): part is { type: "text"; text: string } =>
              typeof part === "object" &&
              part !== null &&
              "type" in part &&
              part.type === "text"
          )
          .map((part) => part.text);
        if (textParts.length > 0) {
          return textParts.join(" ");
        }
      }
      if (Array.isArray(msg.content)) {
        const textParts = msg.content
          .filter(
            (part): part is { type: "text"; text: string } =>
              typeof part === "object" &&
              part !== null &&
              "type" in part &&
              part.type === "text"
          )
          .map((part) => part.text);
        return textParts.join(" ");
      }
    }
  }
  return null;
}
