import * as React from "react";

import { cn } from "@/lib/utils";

interface InputOTPProps {
  length?: number;
  value: string;
  onChange: (value: string) => void;
  onComplete?: (value: string) => void;
  disabled?: boolean;
  className?: string;
}

export function InputOTP({
  length = 8,
  value,
  onChange,
  onComplete,
  disabled = false,
  className,
}: InputOTPProps) {
  const inputRefs = React.useRef<(HTMLInputElement | null)[]>([]);

  const handleChange = (index: number, char: string) => {
    const upperChar = char.toUpperCase();
    if (!/^[A-Z0-9]?$/.test(upperChar)) {
      return;
    }

    const newValue = [...value];
    newValue[index] = upperChar;
    const result = newValue.join("").slice(0, length);
    onChange(result);

    if (upperChar && index < length - 1) {
      inputRefs.current[index + 1]?.focus();
    }

    if (result.length === length && onComplete) {
      onComplete(result);
    }
  };

  const handleKeyDown = (
    index: number,
    e: React.KeyboardEvent<HTMLInputElement>
  ) => {
    if (e.key === "Backspace") {
      if (!value[index] && index > 0) {
        inputRefs.current[index - 1]?.focus();
      }
      const newValue = [...value];
      newValue[index] = "";
      onChange(newValue.join(""));
    } else if (e.key === "ArrowLeft" && index > 0) {
      inputRefs.current[index - 1]?.focus();
    } else if (e.key === "ArrowRight" && index < length - 1) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const pasted = e.clipboardData
      .getData("text")
      .toUpperCase()
      .replaceAll(/[^A-Z0-9]/g, "");
    const result = pasted.slice(0, length);
    onChange(result);

    const nextIndex = Math.min(result.length, length - 1);
    inputRefs.current[nextIndex]?.focus();

    if (result.length === length && onComplete) {
      onComplete(result);
    }
  };

  return (
    <div className={cn("flex gap-2 justify-center", className)}>
      {Array.from({ length }).map((_, index) => (
        <input
          key={index}
          ref={(el) => {
            inputRefs.current[index] = el;
          }}
          type="text"
          inputMode="text"
          maxLength={1}
          value={value[index] || ""}
          onChange={(e) => handleChange(index, e.target.value)}
          onKeyDown={(e) => handleKeyDown(index, e)}
          onPaste={handlePaste}
          disabled={disabled}
          className={cn(
            "h-12 w-10 border border-input bg-background text-center font-mono text-lg uppercase",
            "focus:outline-none focus:border-ring focus:ring-1 focus:ring-ring",
            "disabled:opacity-50 disabled:cursor-not-allowed"
          )}
        />
      ))}
    </div>
  );
}
