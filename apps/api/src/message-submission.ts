export function messageSubmissionIssue(message: { status: string; approvalStatus?: string | null }) {
  if (message.approvalStatus !== "APPROVED") return "Message needs approval before submission.";
  if (message.status !== "APPROVED") return `Message is already ${message.status.toLowerCase()} and cannot be submitted again.`;
  return null;
}
