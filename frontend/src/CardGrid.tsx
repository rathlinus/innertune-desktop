import type { HomeCard } from "./types";
import { CardTile } from "./CardShelf";

// A wrapping grid of cards — the target of a shelf's "Mehr" link (an artist's
// full albums/singles/videos list, etc.). Same tiles as the carousels, just
// laid out as a grid instead of a horizontal scroller.
export function CardGrid({
  cards,
  nowId,
  onCard,
  onMenu,
}: {
  cards: HomeCard[];
  nowId?: string;
  onCard: (c: HomeCard) => void;
  onMenu?: (c: HomeCard, e: React.MouseEvent) => void;
}) {
  return (
    <div className="shelf-grid">
      {cards.map((card, i) => (
        <CardTile
          key={(card.videoId ?? card.playlistId ?? card.browseId ?? "") + i}
          card={card}
          active={!!card.videoId && card.videoId === nowId}
          onClick={() => onCard(card)}
          onMenu={onMenu}
        />
      ))}
    </div>
  );
}
