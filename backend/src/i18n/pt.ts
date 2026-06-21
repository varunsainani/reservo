import type { Messages } from "./en";

// Português (pt) — default locale. Full key parity with en.ts.
export const pt: Messages = {
  errors: {
    common: {
      internal: "Algo deu errado. Tente novamente.",
      notFound: "Não encontrado.",
      validation: "Alguns campos são inválidos.",
      badRequest: "Requisição inválida.",
      malformedJson: "O corpo da requisição não é um JSON válido.",
      payloadTooLarge: "O corpo da requisição é muito grande.",
      rateLimited: "Muitas requisições. Aguarde um momento e tente novamente.",
      forbidden: "Você não tem permissão para fazer isso.",
      unauthorized: "Autenticação necessária.",
      methodNotAllowed: "Método não permitido.",
    },
    auth: {
      invalidCredentials: "E-mail ou senha inválidos.",
      emailTaken: "Esse e-mail já está cadastrado.",
      cannotRegisterAdmin: "Você não pode se cadastrar como administrador.",
      tokenInvalid: "Sessão inválida ou expirada. Faça login novamente.",
      tokenMissing: "Autenticação necessária.",
      refreshInvalid: "Token de atualização inválido ou expirado.",
      refreshReused: "Sessão reutilizada. Por segurança, encerramos todas as sessões.",
      forbiddenRole: "O papel da sua conta não tem acesso a este recurso.",
    },
    booking: {
      slotTaken: "Esse horário acabou de ser reservado. Escolha outro, por favor.",
      slotInPast: "Esse horário já passou.",
      slotInvalid: "Esse horário não está disponível para este serviço.",
      serviceNotFound: "Serviço não encontrado.",
      serviceInactive: "Esse serviço não está disponível para reserva no momento.",
      providerNotFound: "Profissional não encontrado.",
      bookingNotFound: "Reserva não encontrada.",
      notReschedulable: "Esta reserva não pode mais ser remarcada.",
      notCancellable: "Esta reserva não pode mais ser cancelada.",
      invalidAction: "Ação desconhecida.",
      invalidDate: "Data inválida.",
    },
    payment: {
      invalidToken: "Autorização de pagamento inválida.",
      paymentNotFound: "Pagamento não encontrado.",
      alreadyProcessed: "Este pagamento já foi processado.",
      bookingNotPending: "Esta reserva não está mais aguardando pagamento.",
      invalidOutcome: "Resultado de pagamento inválido.",
      providerError: "Não foi possível contatar o provedor de pagamento. Tente novamente.",
    },
    provider: {
      notFound: "Perfil do profissional não encontrado.",
      slugTaken: "Esse identificador de URL já está em uso. Escolha outro.",
      serviceNotFound: "Serviço não encontrado.",
      blockNotFound: "Bloqueio de horário não encontrado.",
      invalidAvailability: "As regras de disponibilidade são inválidas.",
      invalidTimezone: "Fuso horário inválido.",
    },
    cron: {
      forbidden: "Segredo do cron inválido.",
    },
  },
  confirmation: {
    waText:
      "Olá! Acabei de confirmar minha reserva de {service} com {provider} em {date} às {time}. Até lá!",
    subject: "Sua reserva está confirmada — {provider}",
    body:
      "Sua reserva de {service} com {provider} em {date} às {time} está confirmada. Esperamos por você.",
    statusConfirmed: "Confirmada",
    statusPending: "Aguardando pagamento",
  },
};
