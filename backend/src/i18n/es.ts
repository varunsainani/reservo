import type { Messages } from "./en";

// Español (es). Full key parity with en.ts.
export const es: Messages = {
  errors: {
    common: {
      internal: "Algo salió mal. Inténtalo de nuevo.",
      notFound: "No encontrado.",
      validation: "Algunos campos no son válidos.",
      badRequest: "Solicitud inválida.",
      malformedJson: "El cuerpo de la solicitud no es un JSON válido.",
      payloadTooLarge: "El cuerpo de la solicitud es demasiado grande.",
      rateLimited: "Demasiadas solicitudes. Espera un momento e inténtalo de nuevo.",
      forbidden: "No tienes permiso para hacer eso.",
      unauthorized: "Autenticación requerida.",
      methodNotAllowed: "Método no permitido.",
    },
    auth: {
      invalidCredentials: "Correo o contraseña inválidos.",
      emailTaken: "Ese correo ya está registrado.",
      cannotRegisterAdmin: "No puedes registrarte como administrador.",
      tokenInvalid: "Sesión inválida o expirada. Inicia sesión de nuevo.",
      tokenMissing: "Autenticación requerida.",
      refreshInvalid: "Token de actualización inválido o expirado.",
      refreshReused: "Sesión reutilizada. Por seguridad cerramos todas las sesiones.",
      forbiddenRole: "El rol de tu cuenta no tiene acceso a este recurso.",
    },
    booking: {
      slotTaken: "Lo sentimos, ese horario acaba de ser reservado. Elige otro.",
      slotInPast: "Ese horario ya pasó.",
      slotInvalid: "Ese horario no está disponible para este servicio.",
      serviceNotFound: "Servicio no encontrado.",
      serviceInactive: "Ese servicio no está disponible para reservar en este momento.",
      providerNotFound: "Profesional no encontrado.",
      bookingNotFound: "Reserva no encontrada.",
      notReschedulable: "Esta reserva ya no se puede reprogramar.",
      notCancellable: "Esta reserva ya no se puede cancelar.",
      invalidAction: "Acción desconocida.",
      invalidDate: "Fecha inválida.",
    },
    payment: {
      invalidToken: "Autorización de pago inválida.",
      paymentNotFound: "Pago no encontrado.",
      alreadyProcessed: "Este pago ya fue procesado.",
      bookingNotPending: "Esta reserva ya no está esperando el pago.",
      invalidOutcome: "Resultado de pago inválido.",
      providerError: "No se pudo contactar al proveedor de pago. Inténtalo de nuevo.",
    },
    provider: {
      notFound: "Perfil del profesional no encontrado.",
      slugTaken: "Ese identificador de URL ya está en uso. Elige otro.",
      serviceNotFound: "Servicio no encontrado.",
      blockNotFound: "Bloqueo de horario no encontrado.",
      invalidAvailability: "Las reglas de disponibilidad no son válidas.",
      invalidTimezone: "Zona horaria inválida.",
    },
    cron: {
      forbidden: "Secreto de cron inválido.",
    },
  },
  confirmation: {
    waText:
      "¡Hola! Acabo de confirmar mi reserva de {service} con {provider} el {date} a las {time}. ¡Nos vemos!",
    subject: "Tu reserva está confirmada — {provider}",
    body:
      "Tu reserva de {service} con {provider} el {date} a las {time} está confirmada. Te esperamos.",
    statusConfirmed: "Confirmada",
    statusPending: "Esperando el pago",
  },
};
