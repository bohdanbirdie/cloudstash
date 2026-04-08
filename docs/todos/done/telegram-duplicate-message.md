# AI summary re-request sends duplicate Telegram message

Re-requesting an AI summary from the UI re-sends a Telegram message to the user for that item. Telegram messages should only be sent for Telegram interactions, not for UI-triggered summary regeneration.
