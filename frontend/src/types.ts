// One credited artist and the artist page it links to.
export interface ArtistRef {
  name: string;
  browseId: string | null;
}

export interface Track {
  videoId: string;
  title: string;
  artist: string;
  artists?: ArtistRef[]; // the individual credits behind `artist`
  album: string | null;
  duration: string | null;
  durationSeconds: number | null;
  thumbnail: string | null;
  setVideoId?: string | null; // only on playlist tracks; needed to remove them
  // Context-menu extras (from the row's menu — see server parse.ts menuExtras).
  channelId?: string | null; // "Künstlerseite anzeigen"
  albumBrowseId?: string | null; // "Album anzeigen"
  libraryAddToken?: string | null; // feedback token: add to library
  libraryRemoveToken?: string | null; // feedback token: remove from library
  inLibrary?: boolean; // current library membership at fetch time
  entityId?: string | null; // uploaded tracks only — for deleteUploadEntity
}

// get_song — track metadata from the player.
export interface SongDetails {
  videoId: string;
  title: string | null;
  author: string | null;
  channelId: string | null;
  lengthSeconds: number | null;
  viewCount: number | null;
  musicVideoType: string | null;
  thumbnail: string | null;
  publishDate: string | null;
  category: string | null;
}

// An artist in the onboarding taste profile.
export interface TasteArtist {
  name: string | null;
  selectionValue: string | null;
  impressionValue: string | null;
  thumbnail: string | null;
}

export interface Episode {
  videoId: string | null;
  title: string | null;
  description: string | null;
  date: string | null;
  duration: string | null;
  thumbnail: string | null;
}

export interface PodcastPage {
  title: string | null;
  author: string | null;
  description: string | null;
  thumbnail: string | null;
  episodes: Episode[];
}

// A search suggestion with its (optional) history-removal token.
export interface SearchSuggestion {
  query: string;
  fromHistory: boolean;
  removeToken: string | null;
}

// One stretch of the song the music video also covers: song time `primary`
// (seconds) corresponds to video time `counterpart`, for `duration` seconds.
export interface VideoSegment {
  primary: number;
  counterpart: number;
  duration: number;
}

// What the "Titel / Video" toggle shows for a track. `videoId` null: there is
// no video (toggle hidden). `segments` null: the video IS the playing track, so
// its timeline matches the audio 1:1.
export interface VideoCounterpart {
  videoId: string | null;
  segments: VideoSegment[] | null;
}

// "Statistiken für Interessierte" — technical details of the audio stream.
export interface StreamInfo {
  videoId: string;
  itag: number | null;
  codec: string | null;
  container: string | null;
  bitrate: number | null;
  averageBitrate: number | null;
  audioSampleRate: string | null;
  audioChannels: number | null;
  contentLength: string | null;
  loudnessDb: number | null;
  client: string;
}

export interface Playlist {
  playlistId: string;
  title: string;
  thumbnail: string | null;
  count: string | number | null;
}

export type LoginState =
  | { status: "idle" }
  | { status: "waiting" }
  | { status: "captured" }
  | { status: "error"; message: string };

export interface AuthStatus {
  authenticated: boolean;
  // A session was captured but Google no longer honours it — sign in again.
  expired?: boolean;
  login?: LoginState;
}

export interface Account {
  name: string | null;
  handle: string | null;
  photo: string | null;
}

export interface Lyrics {
  text: string | null;
  source: string | null;
}

export interface HomeCard {
  kind: "video" | "playlist" | "album";
  videoId?: string;
  playlistId?: string | null;
  browseId?: string | null;
  title: string;
  subtitle: string | null;
  artists?: ArtistRef[]; // video cards: the artist credits inside `subtitle`
  thumbnail: string | null;
  aspect: "video" | "square";
  explicit: boolean;
}

export interface Chip {
  text: string | null;
  browseId: string | null;
  params: string | null;
  color: string | null;
  icon: string | null;
}

export interface Shelf {
  title: string;
  cards: HomeCard[];
  chips?: Chip[];
  // The shelf header's "more" target — fetch the full grid via getArtistAlbums.
  moreBrowseId?: string | null;
  moreParams?: string | null;
}

// A plain grid of cards (an artist's full albums/singles list).
export interface GridPage {
  title: string | null;
  cards: HomeCard[];
}

export interface SearchResult {
  kind: "song" | "album" | "artist" | "playlist";
  videoId?: string;
  browseId?: string;
  playlistId?: string | null;
  title: string | null;
  subtitle: string | null;
  thumbnail: string | null;
  duration: string | null;
  explicit: boolean;
  artists?: ArtistRef[]; // songs: the artist credits inside `subtitle`
  channelId?: string | null;
  albumBrowseId?: string | null;
  libraryAddToken?: string | null;
  libraryRemoveToken?: string | null;
  inLibrary?: boolean;
}

export interface ArtistPage {
  name: string | null;
  thumbnail: string | null;
  subscribers: string | null;
  channelId: string | null;
  subscribed: boolean;
  description: string | null;
  songs: Track[];
  shelves: Shelf[];
}

export interface PlaylistPage {
  title: string | null;
  owner: string | null;
  ownerThumbnail: string | null;
  subtitle: string | null; // "Autom. Playlist • 2026"
  secondSubtitle: string | null; // "383 Songs • Über 5 Stunden"
  description: string | null;
  thumbnail: string | null;
  results: Track[];
}

export interface AlbumPage {
  title: string | null;
  artist: string | null;
  subtitle: string | null; // "EP • 1997"
  secondSubtitle: string | null; // "4 Songs • 23 Minuten"
  thumbnail: string | null;
  tracks: Track[];
}

export interface UpNext {
  tracks: Track[];
  continuation: string | null;
  relatedBrowseId: string | null;
  lyricsBrowseId: string | null;
}

export interface HistorySection {
  title: string | null;
  tracks: Track[];
}

export interface ArtistCard {
  browseId: string;
  name: string | null;
  subtitle: string | null;
  thumbnail: string | null;
}
