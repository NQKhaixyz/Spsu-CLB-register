export function vietnameseUppercase(text: string) {
  return text.toLocaleUpperCase("vi-VN");
}

export function uppercaseSelection(text: string, start: number, end: number) {
  if (start === end) {
    const cursor = vietnameseUppercase(text.slice(0, start)).length;
    return { value: vietnameseUppercase(text), start: cursor, end: cursor };
  }
  const selection = vietnameseUppercase(text.slice(start, end));
  return { value: text.slice(0, start) + selection + text.slice(end), start, end: start + selection.length };
}
