/**
 * Calculate the pixel coordinates of a character position inside a textarea.
 * Replicates textarea computed styles into an off-screen mirror element.
 */
export function getTextareaCaretPoint(
  element: HTMLTextAreaElement,
  position: number,
): { top: number; left: number; lineHeight: number } {
  if (typeof window === "undefined" || !element) {
    return { top: 0, left: 0, lineHeight: 20 };
  }

  const computed = window.getComputedStyle(element);
  const div = document.createElement("div");

  const styleProps = [
    "boxSizing",
    "width",
    "fontFamily",
    "fontSize",
    "fontWeight",
    "fontStyle",
    "letterSpacing",
    "lineHeight",
    "paddingTop",
    "paddingRight",
    "paddingBottom",
    "paddingLeft",
    "borderTopWidth",
    "borderRightWidth",
    "borderBottomWidth",
    "borderLeftWidth",
    "textIndent",
    "whiteSpace",
    "wordWrap",
    "wordBreak",
    "tabSize",
  ] as const;

  div.style.position = "absolute";
  div.style.visibility = "hidden";
  div.style.pointerEvents = "none";
  div.style.top = "0";
  div.style.left = "-9999px";
  div.style.whiteSpace = "pre-wrap";
  div.style.wordWrap = "break-word";

  for (const prop of styleProps) {
    const cssName = prop.replace(/([A-Z])/g, "-$1").toLowerCase();
    div.style.setProperty(cssName, computed.getPropertyValue(cssName));
  }

  div.style.width = `${element.clientWidth || element.offsetWidth}px`;

  document.body.appendChild(div);

  const textBefore = element.value.substring(0, Math.max(0, position));
  div.textContent = textBefore;

  const marker = document.createElement("span");
  marker.textContent = "@";
  div.appendChild(marker);

  const lineHeight = parseInt(computed.lineHeight, 10) || 20;

  const coordinates = {
    top: marker.offsetTop - element.scrollTop,
    left: marker.offsetLeft - element.scrollLeft,
    lineHeight,
  };

  document.body.removeChild(div);
  return coordinates;
}
