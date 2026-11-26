export function copyButton(value: string, name: string): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "copy";
  button.textContent = "Copy";
  button.setAttribute("aria-label", `Copy ${name}`);
  button.addEventListener("click", () => {
    void write(value)
      .then(() => {
        button.textContent = "Copied";
      })
      .catch(() => {
        button.textContent = "Copy failed";
      })
      .finally(() => {
        window.setTimeout(() => {
          button.textContent = "Copy";
        }, 2000);
      });
  });
  return button;
}

async function write(value: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(value);
  } catch {
    const field = document.createElement("textarea");
    field.value = value;
    field.setAttribute("aria-hidden", "true");
    field.style.position = "fixed";
    field.style.top = "0";
    field.style.left = "0";
    field.style.opacity = "0";
    document.body.append(field);
    field.focus();
    field.select();
    const ok = document.execCommand("copy");
    field.remove();
    if (!ok) throw new Error("copy failed");
  }
}
