import { useRef } from "react";
import type { Chip, HomeCard, Shelf } from "./types";
import {
  IconPlay,
  IconMore,
  IconChevronLeft,
  IconChevronRight,
  IconTrendingUp,
  IconMood,
  IconNewRelease,
} from "./icons";
import { Equalizer } from "./Equalizer";

// The icon for an Explore quick-link, by its renderer iconType.
function ChipIcon({ type }: { type: string | null }) {
  const Icon =
    type === "TRENDING_UP" ? IconTrendingUp : type === "STICKER_EMOTICON" ? IconMood : IconNewRelease;
  return <Icon size={22} />;
}

// A horizontally-scrolling row of cards — shared by Home, Artist pages and
// Related. Cards navigate (album/artist/playlist) or play (video) via onCard.
export function CardShelf({
  shelf,
  nowId,
  onCard,
  onChip,
  onMenu,
}: {
  shelf: Shelf;
  nowId?: string;
  onCard: (c: HomeCard) => void;
  onChip?: (c: Chip) => void;
  onMenu?: (c: HomeCard, e: React.MouseEvent) => void;
}) {
  const trackRef = useRef<HTMLDivElement | null>(null);

  const scroll = (dir: -1 | 1) => {
    const el = trackRef.current;
    if (el) el.scrollBy({ left: dir * el.clientWidth * 0.9, behavior: "smooth" });
  };

  // A nav-button shelf. Two flavors: the quick-links (icon + label, no color)
  // render as wide icon buttons; the mood/genre chips (colored, no icon) render
  // as colored pills.
  if (shelf.chips?.length) {
    const quickLinks = !shelf.chips[0].color;
    return (
      <section className="shelf">
        {shelf.title && (
          <div className="shelf-head">
            <h2 className="shelf-title">{shelf.title}</h2>
          </div>
        )}
        <div className={quickLinks ? "quicklink-row" : "chip-row"}>
          {shelf.chips.map((chip, i) => (
            <button
              key={(chip.browseId ?? "") + (chip.params ?? "") + i}
              className={quickLinks ? "quicklink" : "mood-chip"}
              style={!quickLinks && chip.color ? { ["--chip" as string]: chip.color } : undefined}
              onClick={() => onChip?.(chip)}
            >
              {quickLinks && <ChipIcon type={chip.icon} />}
              <span>{chip.text}</span>
            </button>
          ))}
        </div>
      </section>
    );
  }

  return (
    <section className="shelf">
      <div className="shelf-head">
        <h2 className="shelf-title">{shelf.title}</h2>
        <div className="shelf-actions">
          <button className="carousel-btn" onClick={() => scroll(-1)} title="Zurück">
            <IconChevronLeft size={24} />
          </button>
          <button className="carousel-btn" onClick={() => scroll(1)} title="Weiter">
            <IconChevronRight size={24} />
          </button>
        </div>
      </div>

      <div className="shelf-track" ref={trackRef}>
        {shelf.cards.map((card, i) => (
          <Card
            key={(card.videoId ?? card.playlistId ?? card.browseId ?? "") + i}
            card={card}
            active={!!card.videoId && card.videoId === nowId}
            onClick={() => onCard(card)}
            onMenu={onMenu}
          />
        ))}
      </div>
    </section>
  );
}

function Card({
  card,
  active,
  onClick,
  onMenu,
}: {
  card: HomeCard;
  active: boolean;
  onClick: () => void;
  onMenu?: (c: HomeCard, e: React.MouseEvent) => void;
}) {
  return (
    <div
      className={`card ${card.aspect === "video" ? "card-video" : "card-square"} ${
        active ? "card-active" : ""
      }`}
      onClick={onClick}
      onContextMenu={onMenu ? (e) => { e.preventDefault(); onMenu(card, e); } : undefined}
    >
      <div className="card-thumb">
        {card.thumbnail && <img src={card.thumbnail} alt="" loading="lazy" />}
        {active && (
          <span className="card-eq">
            <Equalizer />
          </span>
        )}
        <button className="card-play" title="Abspielen">
          <IconPlay size={24} />
        </button>
        {onMenu && (
          <button
            className="card-more"
            title="Mehr"
            onClick={(e) => { e.stopPropagation(); onMenu(card, e); }}
          >
            <IconMore size={20} />
          </button>
        )}
      </div>
      <div className="card-title" title={card.title}>
        {card.explicit && <span className="explicit">E</span>}
        {card.title}
      </div>
      {card.subtitle && (
        <div className="card-sub" title={card.subtitle}>
          {card.subtitle}
        </div>
      )}
    </div>
  );
}
