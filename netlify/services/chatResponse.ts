import { SteamApiError } from "./steamApi";

export const textResponse = (message: string) =>
  new Response(message, { headers: { "Content-Type": "text/plain; charset=utf-8" } });

export const steamErrorMessage = (error: unknown, command: string): string => {
  if (error instanceof SteamApiError) {
    switch (error.kind) {
      case "private":
        return "El perfil de Steam es privado 🔒";
      case "config":
        return `El comando ${command} está mal configurado 🛠️`;
      default:
        return "Steam no responde, intenta en un rato ⏳";
    }
  }
  return "No pude obtener las stats de Steam, intenta en un rato ⏳";
};
