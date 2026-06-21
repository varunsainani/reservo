import { getRequestConfig } from "next-intl/server";
import { getUserLocale } from "./locale";

export default getRequestConfig(async () => {
  const locale = await getUserLocale();
  return {
    locale,
    messages: (await import(`./messages/${locale}.json`)).default,
    // Slot timestamps already carry the provider timezone in display helpers;
    // keep the intl base zone at UTC so raw ISO values format consistently.
    timeZone: "UTC",
  };
});
