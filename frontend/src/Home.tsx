import type { Chip, HomeCard, Shelf } from "./types";
import { CardShelf } from "./CardShelf";

interface Props {
  shelves: Shelf[];
  nowId?: string;
  onCard: (card: HomeCard) => void;
  onChip?: (chip: Chip) => void;
  onCardMenu?: (card: HomeCard, e: React.MouseEvent) => void;
}

export function Home({ shelves, nowId, onCard, onChip, onCardMenu }: Props) {
  return (
    <div className="home">
      {shelves.map((shelf, i) => (
        <CardShelf
          key={shelf.title ?? `shelf-${i}`}
          shelf={shelf}
          nowId={nowId}
          onCard={onCard}
          onChip={onChip}
          onMenu={onCardMenu}
        />
      ))}
    </div>
  );
}
