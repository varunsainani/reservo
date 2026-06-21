// English (en) backend messages. Keys mirror pt.ts / es.ts exactly (full parity).
// `Messages` (below) widens all leaves to `string` so pt/es can supply
// translations without TS demanding the literal English text.
const enCatalog = {
  errors: {
    common: {
      internal: "Something went wrong. Please try again.",
      notFound: "Not found.",
      validation: "Some fields are invalid.",
      badRequest: "Invalid request.",
      malformedJson: "The request body is not valid JSON.",
      payloadTooLarge: "The request body is too large.",
      rateLimited: "Too many requests. Please slow down and try again shortly.",
      forbidden: "You do not have permission to do that.",
      unauthorized: "Authentication required.",
      methodNotAllowed: "Method not allowed.",
    },
    auth: {
      invalidCredentials: "Invalid email or password.",
      emailTaken: "That email address is already registered.",
      cannotRegisterAdmin: "You cannot register as an administrator.",
      tokenInvalid: "Invalid or expired session. Please sign in again.",
      tokenMissing: "Authentication required.",
      refreshInvalid: "Invalid or expired refresh token.",
      refreshReused: "Session reused. For your safety we have signed you out everywhere.",
      forbiddenRole: "Your account role is not allowed to access this resource.",
    },
    booking: {
      slotTaken: "Sorry, that time slot was just taken. Please choose another.",
      slotInPast: "That time slot is in the past.",
      slotInvalid: "That time slot is not available for this service.",
      serviceNotFound: "Service not found.",
      serviceInactive: "That service is not currently available for booking.",
      providerNotFound: "Provider not found.",
      bookingNotFound: "Booking not found.",
      notReschedulable: "This booking can no longer be rescheduled.",
      notCancellable: "This booking can no longer be cancelled.",
      invalidAction: "Unknown action.",
      invalidDate: "Invalid date.",
    },
    payment: {
      invalidToken: "Invalid payment authorization.",
      paymentNotFound: "Payment not found.",
      alreadyProcessed: "This payment has already been processed.",
      bookingNotPending: "This booking is no longer awaiting payment.",
      invalidOutcome: "Invalid payment outcome.",
      providerError: "The payment provider could not be reached. Please try again.",
    },
    provider: {
      notFound: "Provider profile not found.",
      slugTaken: "That URL handle is already in use. Please pick another.",
      serviceNotFound: "Service not found.",
      blockNotFound: "Time block not found.",
      invalidAvailability: "Availability rules are invalid.",
      invalidTimezone: "Invalid timezone.",
    },
    cron: {
      forbidden: "Invalid cron secret.",
    },
  },
  confirmation: {
    // {service}, {provider}, {date}, {time}
    waText:
      "Hello! I just confirmed my booking for {service} with {provider} on {date} at {time}. See you then!",
    subject: "Your booking is confirmed — {provider}",
    body:
      "Your booking for {service} with {provider} on {date} at {time} is confirmed. We look forward to seeing you.",
    statusConfirmed: "Confirmed",
    statusPending: "Waiting for payment",
  },
};

// Recursively widen string literals to `string` so other locales type-check.
type Widen<T> = {
  [K in keyof T]: T[K] extends string ? string : Widen<T[K]>;
};

export type Messages = Widen<typeof enCatalog>;

export const en: Messages = enCatalog;
