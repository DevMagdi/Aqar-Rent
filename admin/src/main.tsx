import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { App } from "./App";
import "./index.css";

document.documentElement.dataset.js = "true";
document.addEventListener("visibilitychange", () => {
  document.documentElement.toggleAttribute("data-hidden", document.visibilityState === "hidden");
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
);
