export function curve(input: {
  startPrice: bigint;
  endPrice: bigint;
  startTime: bigint;
  endTime: bigint;
  startLabel: string;
  endLabel: string;
  mark: { at: bigint; price: bigint; label: string } | null;
}): SVGSVGElement {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.classList.add("curve");
  svg.setAttribute("viewBox", "0 0 640 248");
  svg.setAttribute("role", "img");
  svg.setAttribute("aria-label", `Price line from ${input.startLabel} to ${input.endLabel}`);
  const pad = 48;
  const width = 640 - pad * 2;
  const top = 52;
  const height = 148;
  const hi = input.startPrice > input.endPrice ? input.startPrice : input.endPrice;
  const lo = input.startPrice < input.endPrice ? input.startPrice : input.endPrice;
  const span = hi - lo || 1n;
  const yOf = (price: bigint) => top + (Number(hi - price) / Number(span)) * height;
  const y0 = yOf(input.startPrice);
  const y1 = yOf(input.endPrice);
  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  path.setAttribute("d", `M ${pad} ${y0} L ${pad + width} ${y1}`);
  svg.append(path);
  const start = label(String(pad), String(Math.max(18, y0 - 18)), input.startLabel, "start");
  const endY = y1 >= y0 ? Math.min(236, y1 + 24) : Math.max(18, y1 - 18);
  const end = label(String(pad + width), String(endY), input.endLabel, "end");
  end.setAttribute("text-anchor", "end");
  svg.append(start, end);
  const mark = input.mark;
  const spanTime = input.endTime - input.startTime;
  if (mark && spanTime > 0n && mark.at >= input.startTime && mark.at <= input.endTime) {
    const x = pad + (Number(mark.at - input.startTime) / Number(spanTime)) * width;
    const y = yOf(mark.price);
    const dot = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    dot.classList.add("mark");
    dot.setAttribute("cx", String(x));
    dot.setAttribute("cy", String(y));
    dot.setAttribute("r", "4.5");
    svg.append(dot);
    const nearStart = Math.abs(x - pad) < 150 && Math.abs(y - y0) < 36;
    const noteX = nearStart ? pad + 108 : Math.min(x + 14, 470);
    const noteY = nearStart ? Math.max(18, y0 - 18) : Math.max(18, y - 24);
    const note = label(String(noteX), String(noteY), mark.label, "mark");
    svg.append(note);
  }
  return svg;
}

function label(x: string, y: string, text: string, className: string): SVGTextElement {
  const node = document.createElementNS("http://www.w3.org/2000/svg", "text");
  node.classList.add(className);
  node.setAttribute("x", x);
  node.setAttribute("y", y);
  node.textContent = text;
  return node;
}
