import EmailService from "../../../services/emailService.js";
import { ApplicationFailure } from "@temporalio/activity";
import { SendWeatherAlertInput, SendWeatherAlertResult } from "../type.js";

const email = new EmailService(); // singleton per worker process

export async function sendWeatherAlert(
  input: SendWeatherAlertInput,
): Promise<SendWeatherAlertResult> {
  const subject = input.subject ?? "Weather Alert"; // add `subject?` to your type if needed
  const body = input.message;
  const recipientEmail = input.email; // swap phone_number → email in your type

  const result = await email.send(recipientEmail, subject, body);

  if (!result.ok) {
    // Non-retryable errors (bad creds, bad address) → stop Temporal retrying
    if (!result.error.retryable) {
      throw ApplicationFailure.nonRetryable(
        result.error.message,
        result.error.code,
      );
    }
    // Retryable → let Temporal's retry policy handle it
    throw new Error(result.error.message);
  }

  return {
    alertId: result.messageId,
    sentAt: result.sentAt,
    channel: "email",
  };
}
