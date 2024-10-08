import { ParsedMessage } from "@/utils/types";

// Converts "John Doe <john.doe@gmail>" to "John Doe"
// Converts "<john.doe@gmail>" to "john.doe@gmail"
// Converts "john.doe@gmail" to "john.doe@gmail"
export function extractNameFromEmail(email: string) {
  return email?.split("<")[0] || email?.split("<")?.[1] || email;
}

// Converts "John Doe <john.doe@gmail>" to "john.doe@gmail"
export function extractEmailAddress(email: string): string {
  const match = email.match(/<(.*)>/);
  return match ? match[1] : "";
}

// Converts "Name <hey@domain.com>" to "domain.com"
export function extractDomainFromEmail(email: string) {
  const domain = email.match(/@([\w.-]+\.[a-zA-Z]{2,6})/)?.[1];
  return domain;
}

// returns the other side of the conversation
// if we're the sender, then return the recipient
// if we're the recipient, then return the sender
export function participant(parsedMessage: ParsedMessage, userEmail: string) {
  const sender: string = parsedMessage.headers.from;
  const recipient = parsedMessage.headers.to;

  if (sender.includes(userEmail)) return recipient;

  return sender;
}
