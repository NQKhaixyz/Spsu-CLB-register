// API messages and older system log entries can still contain sentence-ending periods.
export function displayMessage(text: string) {
  return text
    .replace(/(?<!\.)\.(?=\s*$)/u, "")
    .replace(/(?<!\.)\.(\s+)(\p{L}+|\d+)/gu, (_, space: string, word: string) => {
      const properName = ["Excel", "YouTube", "SoundCloud", "Google", "Nhịp", "Bông"].includes(word);
      const next = !properName && /^\p{Lu}\p{Ll}/u.test(word) ? word[0].toLocaleLowerCase("vi") + word.slice(1) : word;
      return "," + space + next;
    });
}
