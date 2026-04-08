# Better title handling: decode HTML entities in saved link titles

Titles like `new Worker(&quot;some-package&quot;)` and `doesn&#39;t` appeared with raw HTML entities instead of decoded text. Fixed to decode entities on save.
