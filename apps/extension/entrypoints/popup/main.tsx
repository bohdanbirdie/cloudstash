import "../../styles.css";
import { createRoot } from "react-dom/client";

import { App } from "./app";

const rootEl = document.getElementById("root");
if (!rootEl) throw new Error("popup root missing");
rootEl.classList.add("text-foreground");
createRoot(rootEl).render(<App />);
