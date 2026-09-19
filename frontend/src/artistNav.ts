import { createContext } from "react";

// Opens an artist page by browse id. Provided once by App so every byline
// (player bar, fullscreen, queue, track lists) can link without prop drilling.
export const OpenArtistContext = createContext<((browseId: string) => void) | null>(null);
