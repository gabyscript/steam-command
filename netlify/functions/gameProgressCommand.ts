import type { Config } from "@netlify/functions";
import { ownedGamesUrl } from "../services/steamUrlBuilder";

export default async () => {

    try {

        const gameLibraryUrl = await ownedGamesUrl();

        const response = await fetch(gameLibraryUrl)

        if(!response.ok) {
            return Response.json(
                { error: `Hubo un error al obtener datos de Steam | Status ${response.status}` },
                { status: 502 }
            );
        }

        return Response.json({ mensaje: gameLibraryUrl });
    } catch (error) {
        console.error(error);
        return Response.json({error: "Error consultando libreria de SteamAPI"}, {status: 500})
    }
}

export const config: Config = {
  path: "/api/game-progress",
  method: ["GET"]
};
